#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
PhotoVault Launcher
===================
Painel gráfico Tkinter que substitui os .bat:
  - iniciar.bat          (npm run dev)
  - tunel-cloudflare.bat (npm run dev + cloudflared tunnel)
  - iniciar-publico.bat  (idem, em background)

Recursos:
  - Botões: Iniciar Local | Iniciar Tunel | Reset | Parar | Abrir browser | Verificar
  - Captura stdout/stderr de cada processo em log interno colorido
  - Detecta porta 3000 pronta + URL pública do Cloudflare
  - Reset com 1 clique (kill seguro de árvore + restart)
  - Monitor de hardware: CPU, RAM, disco, processo Node
  - Timing por operação (init, ready, tunel, reset, verify-deep)
  - Roda `node scripts/verify-deep.js` e exibe relatório

Autor: assistente (gerado para Vinícius Rodrigues).
Sem dependências externas: tudo stdlib do Python 3.8+.
"""
from __future__ import annotations

# ── Suprime QUALQUER janela de console ───────────────────────────────────────
# Cobre os 3 cenários problemáticos no Windows:
#   1) .pyw associado errado a python.exe (em vez de pythonw.exe) → cria console
#   2) Usuário rodou via "py photovault.pyw" ou "python photovault.pyw"
#   3) Aberto a partir de um terminal já existente
# Estratégia: ESCONDE o HWND do console via ShowWindow(SW_HIDE) ANTES de tentar
# desanexar com FreeConsole(). A ordem importa — esconder primeiro evita o
# flicker de "janela aparece e some".
# Como bônus, se o executável atual for python.exe, relança com pythonw.exe
# (silenciosamente) e sai imediatamente, eliminando até o processo de console.
import os
import sys
# Só suprime console se este arquivo é o script principal (não importado em testes)
if __name__ == "__main__" and os.name == "nt":
    try:
        import ctypes as _ct
        # 1) Esconde qualquer console herdado IMEDIATAMENTE
        _hwnd = _ct.windll.kernel32.GetConsoleWindow()
        if _hwnd:
            _ct.windll.user32.ShowWindow(_hwnd, 0)   # SW_HIDE = 0
        # 2) Se rodando com python.exe (sempre tem console), relança com
        #    pythonw.exe (sem console nativo) e termina este processo.
        _exe = (sys.executable or "").lower()
        if _exe.endswith("python.exe"):
            _pyw = sys.executable[:-len("python.exe")] + "pythonw.exe"
            if os.path.isfile(_pyw):
                import subprocess as _sp
                _si = _sp.STARTUPINFO()
                _si.dwFlags |= _sp.STARTF_USESHOWWINDOW
                _si.wShowWindow = 0  # SW_HIDE
                try:
                    _sp.Popen(
                        [_pyw, os.path.abspath(__file__)] + sys.argv[1:],
                        creationflags=0x08000000,    # CREATE_NO_WINDOW
                        startupinfo=_si,
                        close_fds=True,
                    )
                    sys.exit(0)
                except Exception:
                    pass
        # 3) Desanexa do console residual (se ainda existir)
        try:
            _ct.windll.kernel32.FreeConsole()
        except Exception:
            pass
        del _ct
    except Exception:
        pass
# ─────────────────────────────────────────────────────────────────────────────

import ctypes
import queue
import re
import shutil
import signal
import subprocess
import threading
import time
import tkinter as tk
import urllib.error
import urllib.request
import webbrowser
from dataclasses import dataclass, field
from pathlib import Path
from tkinter import messagebox, ttk
from typing import Callable, Optional

# ─────────────────────────────────────────────────────────────────────────────
# Paths e constantes
# ─────────────────────────────────────────────────────────────────────────────
ROOT = Path(__file__).resolve().parent
PORT = 3000
LOCAL_URL = f"http://localhost:{PORT}"
PROJECT_NAME = "PhotoVault"
IS_WINDOWS = os.name == "nt"

# Cores (paleta dark elegante)
BG = "#0f1115"
BG_PANEL = "#161922"
BG_CARD = "#1d2230"
BORDER = "#2a3142"
TEXT = "#e8eaf0"
TEXT_DIM = "#9aa3b6"
ACCENT = "#c9a96e"
OK = "#4ade80"
WARN = "#fbbf24"
ERR = "#f87171"
INFO = "#60a5fa"

URL_RE = re.compile(r"https://[-a-zA-Z0-9]+\.trycloudflare\.com")
ANSI_RE = re.compile(r"\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])")
# Next.js imprime "- Local:   http://localhost:3001" quando muda de porta
NEXT_PORT_RE = re.compile(r"(?:Local|localhost)[:\s]+http://(?:localhost|0\.0\.0\.0):(\d+)", re.IGNORECASE)


def _no_console_kw(extra_flags: int = 0) -> dict:
    """Retorna kwargs de subprocess que garantem ZERO janela de console no Windows.
    Combina STARTUPINFO (SW_HIDE) + CREATE_NO_WINDOW — solução à prova de flash."""
    if not IS_WINDOWS:
        return {}
    si = subprocess.STARTUPINFO()
    si.dwFlags |= subprocess.STARTF_USESHOWWINDOW
    si.wShowWindow = 0  # SW_HIDE
    return {
        "startupinfo": si,
        "creationflags": 0x08000000 | extra_flags,  # CREATE_NO_WINDOW
    }


# ─────────────────────────────────────────────────────────────────────────────
# Util
# ─────────────────────────────────────────────────────────────────────────────
def fmt_dur(secs: float) -> str:
    if secs < 1:
        return f"{int(secs * 1000)}ms"
    if secs < 60:
        return f"{secs:.1f}s"
    m, s = divmod(int(secs), 60)
    if m < 60:
        return f"{m}m {s:02d}s"
    h, m = divmod(m, 60)
    return f"{h}h {m:02d}m {s:02d}s"


def fmt_bytes(n: int) -> str:
    for u in ("B", "KB", "MB", "GB", "TB"):
        if n < 1024:
            return f"{n:.1f} {u}"
        n /= 1024
    return f"{n:.1f} PB"


def find_cloudflared() -> Optional[str]:
    """Procura cloudflared no PATH ou na pasta do projeto."""
    if IS_WINDOWS:
        candidate = ROOT / "cloudflared.exe"
        if candidate.exists():
            return str(candidate)
    found = shutil.which("cloudflared")
    return found


def find_npm() -> Optional[str]:
    """Procura npm/npm.cmd no PATH."""
    cmd = "npm.cmd" if IS_WINDOWS else "npm"
    return shutil.which(cmd) or shutil.which("npm")


def find_node() -> Optional[str]:
    return shutil.which("node")


def kill_tree(proc: subprocess.Popen) -> None:
    """Mata o processo + filhos (Windows: taskkill /F /T)."""
    if proc is None or proc.poll() is not None:
        return
    try:
        if IS_WINDOWS:
            subprocess.run(
                ["taskkill", "/F", "/T", "/PID", str(proc.pid)],
                capture_output=True, timeout=10,
                **_no_console_kw(),
            )
        else:
            try:
                os.killpg(os.getpgid(proc.pid), signal.SIGTERM)
            except Exception:
                proc.terminate()
            try:
                proc.wait(timeout=5)
            except subprocess.TimeoutExpired:
                try:
                    os.killpg(os.getpgid(proc.pid), signal.SIGKILL)
                except Exception:
                    proc.kill()
    except Exception:
        try:
            proc.kill()
        except Exception:
            pass


def http_ready(url: str, timeout: float = 1.5) -> bool:
    """HEAD/GET no URL — retorna True se respondeu < 500."""
    try:
        req = urllib.request.Request(url, method="GET")
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return r.status < 500
    except Exception:
        return False


# ─────────────────────────────────────────────────────────────────────────────
# Hardware monitor (sem dependência externa)
# ─────────────────────────────────────────────────────────────────────────────
class HardwareMonitor:
    """Lê CPU/RAM/disk usando APIs nativas. Tenta psutil se existir."""

    def __init__(self) -> None:
        self._psutil = None
        try:
            import psutil  # type: ignore
            self._psutil = psutil
        except ImportError:
            self._psutil = None
        self._last_cpu_time = None
        self._last_idle = None
        # GPU cache + flag de disponibilidade (evita re-spawn de nvidia-smi)
        self._gpu_cache: list[dict] = []
        self._gpu_cache_at: float = 0.0
        self._gpu_available: Optional[bool] = None  # None=ainda não testado

    # ---------- RAM ----------
    def memory(self) -> tuple[float, int, int]:
        """Retorna (percent, used_bytes, total_bytes)."""
        if self._psutil:
            m = self._psutil.virtual_memory()
            return m.percent, m.used, m.total
        if IS_WINDOWS:
            class MEMORYSTATUSEX(ctypes.Structure):
                _fields_ = [
                    ("dwLength", ctypes.c_ulong),
                    ("dwMemoryLoad", ctypes.c_ulong),
                    ("ullTotalPhys", ctypes.c_ulonglong),
                    ("ullAvailPhys", ctypes.c_ulonglong),
                    ("ullTotalPageFile", ctypes.c_ulonglong),
                    ("ullAvailPageFile", ctypes.c_ulonglong),
                    ("ullTotalVirtual", ctypes.c_ulonglong),
                    ("ullAvailVirtual", ctypes.c_ulonglong),
                    ("ullAvailExtendedVirtual", ctypes.c_ulonglong),
                ]
            stat = MEMORYSTATUSEX()
            stat.dwLength = ctypes.sizeof(MEMORYSTATUSEX)
            ctypes.windll.kernel32.GlobalMemoryStatusEx(ctypes.byref(stat))
            used = stat.ullTotalPhys - stat.ullAvailPhys
            return stat.dwMemoryLoad, used, stat.ullTotalPhys
        # Linux/Mac fallback simples via /proc/meminfo
        try:
            info = {}
            with open("/proc/meminfo") as f:
                for line in f:
                    k, v = line.split(":", 1)
                    info[k.strip()] = int(v.strip().split()[0]) * 1024
            total = info.get("MemTotal", 0)
            avail = info.get("MemAvailable", info.get("MemFree", 0))
            used = total - avail
            pct = (used / total * 100) if total else 0
            return pct, used, total
        except Exception:
            return 0, 0, 0

    # ---------- CPU ----------
    def cpu_percent(self) -> float:
        """% de CPU desde a última chamada (não bloqueante)."""
        if self._psutil:
            return self._psutil.cpu_percent(interval=None)
        if IS_WINDOWS:
            # GetSystemTimes
            class FILETIME(ctypes.Structure):
                _fields_ = [("dwLowDateTime", ctypes.c_ulong), ("dwHighDateTime", ctypes.c_ulong)]
            idle = FILETIME(); kernel = FILETIME(); user = FILETIME()
            ctypes.windll.kernel32.GetSystemTimes(ctypes.byref(idle), ctypes.byref(kernel), ctypes.byref(user))
            def to_int(ft): return (ft.dwHighDateTime << 32) | ft.dwLowDateTime
            idle_t = to_int(idle)
            total_t = to_int(kernel) + to_int(user)
            if self._last_cpu_time is None:
                self._last_cpu_time = total_t
                self._last_idle = idle_t
                return 0.0
            dt = total_t - self._last_cpu_time
            di = idle_t - self._last_idle
            self._last_cpu_time = total_t
            self._last_idle = idle_t
            if dt <= 0:
                return 0.0
            return max(0.0, min(100.0, (1 - di / dt) * 100))
        # Linux fallback /proc/stat
        try:
            with open("/proc/stat") as f:
                parts = f.readline().split()[1:]
            nums = [int(x) for x in parts]
            idle = nums[3] + (nums[4] if len(nums) > 4 else 0)
            total = sum(nums)
            if self._last_cpu_time is None:
                self._last_cpu_time = total
                self._last_idle = idle
                return 0.0
            dt = total - self._last_cpu_time
            di = idle - self._last_idle
            self._last_cpu_time = total
            self._last_idle = idle
            if dt <= 0:
                return 0.0
            return max(0.0, min(100.0, (1 - di / dt) * 100))
        except Exception:
            return 0.0

    # ---------- Disco ----------
    def disk(self, path: str) -> tuple[float, int, int]:
        try:
            usage = shutil.disk_usage(path)
            pct = usage.used / usage.total * 100 if usage.total else 0
            return pct, usage.used, usage.total
        except Exception:
            return 0, 0, 0

    # ---------- GPU / VRAM (nvidia-smi; sem crash se ausente) ----------
    def gpu(self) -> list[dict]:
        """Retorna lista de GPUs: [{name, util_pct, vram_used, vram_total}].
        Usa nvidia-smi se disponível; caso contrário retorna lista vazia.
        Resultado é cacheado por 2s para reduzir flicker e overhead."""
        # Cache curto — nvidia-smi é chamado no máximo 1x a cada 2s
        now = time.time()
        if self._gpu_cache_at and (now - self._gpu_cache_at) < 2.0:
            return self._gpu_cache or []
        # Marca o cache antes de tentar — assim, se nvidia-smi não existir,
        # a flag de "available" fica False e nem tentamos de novo.
        self._gpu_cache_at = now
        if self._gpu_available is False:
            return []
        try:
            out = subprocess.run(
                [
                    "nvidia-smi",
                    "--query-gpu=name,utilization.gpu,memory.used,memory.total",
                    "--format=csv,noheader,nounits",
                ],
                capture_output=True, text=True, timeout=4,
                **_no_console_kw(),
            ).stdout.strip()
            if not out:
                self._gpu_cache = []
                return []
            gpus = []
            for line in out.splitlines():
                parts = [p.strip() for p in line.split(",")]
                if len(parts) < 4:
                    continue
                try:
                    gpus.append({
                        "name": parts[0],
                        "util_pct": float(parts[1]),
                        "vram_used": int(parts[2]) * 1024 * 1024,   # MB → bytes
                        "vram_total": int(parts[3]) * 1024 * 1024,
                    })
                except (ValueError, IndexError):
                    pass
            self._gpu_available = True
            self._gpu_cache = gpus
            return gpus
        except FileNotFoundError:
            self._gpu_available = False   # nvidia-smi não instalado
            self._gpu_cache = []
            return []
        except Exception:
            self._gpu_cache = []
            return []


# ─────────────────────────────────────────────────────────────────────────────
# Process runner
# ─────────────────────────────────────────────────────────────────────────────
@dataclass
class ManagedProc:
    name: str
    cmd: list
    cwd: str
    on_line: Callable[[str, str], None]  # (channel, line)
    proc: Optional[subprocess.Popen] = None
    threads: list = field(default_factory=list)
    started_at: Optional[float] = None

    def start(self) -> None:
        if self.proc and self.proc.poll() is None:
            return

        cmd = list(self.cmd)
        kw: dict = {
            "cwd": self.cwd,
            "stdout": subprocess.PIPE,
            "stderr": subprocess.PIPE,
            "stdin": subprocess.DEVNULL,
            "bufsize": 1,
            "encoding": "utf-8",
            "errors": "replace",
        }
        if IS_WINDOWS:
            # .cmd/.bat precisam do cmd.exe — chamar explicitamente evita
            # que o Windows abra um console preto separado.
            exe = cmd[0].lower() if cmd else ""
            if exe.endswith((".cmd", ".bat")):
                cmd = ["cmd", "/c"] + cmd
            # CREATE_NEW_PROCESS_GROUP (0x200) → para Ctrl+C de grupo;
            # CREATE_NO_WINDOW + STARTUPINFO(SW_HIDE) → zero janela visível.
            kw.update(_no_console_kw(extra_flags=0x200))
        else:
            kw["start_new_session"] = True

        self.proc = subprocess.Popen(cmd, **kw)
        self.started_at = time.time()
        self.threads = [
            threading.Thread(target=self._reader, args=("stdout", self.proc.stdout), daemon=True),
            threading.Thread(target=self._reader, args=("stderr", self.proc.stderr), daemon=True),
        ]
        for t in self.threads:
            t.start()

    def _reader(self, channel: str, stream) -> None:
        if stream is None:
            return
        try:
            for raw in iter(stream.readline, ""):
                if not raw:
                    break
                line = ANSI_RE.sub("", raw.rstrip("\r\n"))
                if line:
                    self.on_line(channel, line)
        except Exception:
            pass
        finally:
            try:
                stream.close()
            except Exception:
                pass

    def is_running(self) -> bool:
        return self.proc is not None and self.proc.poll() is None

    def stop(self) -> None:
        kill_tree(self.proc)
        self.proc = None
        self.started_at = None


# ─────────────────────────────────────────────────────────────────────────────
# UI principal
# ─────────────────────────────────────────────────────────────────────────────
class App:
    def __init__(self, root: tk.Tk) -> None:
        self.root = root
        self.queue: queue.Queue = queue.Queue()
        self.hw = HardwareMonitor()

        # Estado
        self.local_proc: Optional[ManagedProc] = None
        self.tunnel_proc: Optional[ManagedProc] = None
        self.verify_proc: Optional[ManagedProc] = None
        self.ready_local = False
        self.ready_tunnel_url: Optional[str] = None
        self.local_started_at: Optional[float] = None
        self.tunnel_started_at: Optional[float] = None
        self.timings: list[tuple[str, float, str]] = []  # (label, duration, status)
        self.session_start = time.time()
        # Porta real detectada no output do Next.js (pode diferir de PORT se ocupada)
        self.actual_port: int = PORT
        # Porta que o túnel atual aponta — usada para decidir se precisa respawn
        self._tunnel_port_at_spawn: int = PORT
        # GPU rows criadas dinamicamente (1 por GPU detectada)
        self._gpu_rows: list[dict] = []
        self._gpu_container: Optional[tk.Frame] = None

        # Resize debouncing + caches (perf durante drag de janela/sash)
        self._btn_resize_after_id: Optional[str] = None
        self._btn_fonts: dict = {}                  # size → tkfont.Font
        self._btn_text_w: dict = {}                 # (size, text) → pixels
        self._last_btn_row_w: int = 0

        # Modo de inicio e estado do watchdog (vars tk criadas aqui, widgets em _build_ui)
        self.mode_var = tk.StringVar(value="dev")
        self.watchdog_var = tk.BooleanVar(value=False)
        self._watchdog_stop_event = threading.Event()
        self._watchdog_thread: Optional[threading.Thread] = None
        self._watchdog_consec_fail: int = 0

        self._build_ui()
        self._poll_queue()
        self._poll_status()
        self._poll_hw()

        # Aviso inicial
        self.log("ui", f"PhotoVault Launcher pronto · raiz: {ROOT}", level="info")
        if not find_npm():
            self.log("ui", "[ATENÇÃO] npm não encontrado no PATH. Instale o Node.js.", level="err")
        if not find_cloudflared():
            self.log("ui", "[INFO] cloudflared não encontrado — coloque cloudflared.exe na raiz ou instale via winget.", level="warn")

    # ---------------------------------------------------------------- UI build
    def _build_ui(self) -> None:
        import tkinter.font as tkfont  # usado em _on_btn_resize

        r = self.root
        r.title(f"{PROJECT_NAME} · Launcher")
        # Janela MAIOR por padrão; minsize bem permissivo para qualquer resize
        r.geometry("1600x980")
        r.minsize(640, 480)
        r.configure(bg=BG)

        # ttk style mínimo (apenas Scrollbar — botões agora são tk.Button)
        style = ttk.Style()
        try:
            style.theme_use("clam")
        except Exception:
            pass
        style.configure(".", background=BG, foreground=TEXT, font=("Segoe UI", 9))
        style.configure("TScrollbar", background=BG_CARD, troughcolor=BG_PANEL, bordercolor=BG_PANEL,
                        arrowcolor=TEXT_DIM, lightcolor=BG_CARD, darkcolor=BG_CARD)

        # ── Header ────────────────────────────────────────────────────────
        header = tk.Frame(r, bg=BG, padx=18, pady=12)
        header.pack(fill="x")
        title = tk.Label(header, text=f"📸 {PROJECT_NAME} Launcher", bg=BG, fg=TEXT, font=("Segoe UI", 18, "bold"))
        title.pack(side="left")
        self.lbl_uptime = tk.Label(header, text="sessão 0s", bg=BG, fg=TEXT_DIM, font=("Segoe UI", 9))
        self.lbl_uptime.pack(side="right", padx=4)

        # ── Status row ────────────────────────────────────────────────────
        status_row = tk.Frame(r, bg=BG, padx=14)
        status_row.pack(fill="x", pady=(0, 6))
        self.card_local = self._make_status_card(status_row, "🖥  Servidor local", "parado", side="left")
        self.card_tunnel = self._make_status_card(status_row, "🌐  Túnel Cloudflare", "parado", side="left")
        self.card_url = self._make_status_card(status_row, "🔗  URL pública", "—", side="left", wide=True)

        # ── Opções: modo de inicio + watchdog ────────────────────────────
        opts_row = tk.Frame(r, bg=BG, padx=14, pady=2)
        opts_row.pack(fill="x")

        mode_card = tk.Frame(opts_row, bg=BG_CARD, highlightbackground=BORDER,
                             highlightthickness=1, padx=10, pady=5)
        mode_card.pack(side="left", padx=(0, 6))
        tk.Label(mode_card, text="Modo:", bg=BG_CARD, fg=TEXT_DIM,
                 font=("Segoe UI", 8, "bold")).pack(side="left", padx=(0, 8))
        for _val, _lbl in [
            ("dev",         "⚡ Dev (hot reload)"),
            ("start",       "🚀 Produção"),
            ("build_start", "🔨 Build + Iniciar"),
        ]:
            tk.Radiobutton(
                mode_card, text=_lbl, variable=self.mode_var, value=_val,
                bg=BG_CARD, fg=TEXT, selectcolor=BG,
                activebackground=BG_CARD, activeforeground=ACCENT,
                font=("Segoe UI", 9), cursor="hand2",
            ).pack(side="left", padx=4)
        tk.Label(mode_card, text="(aplica no próximo start)", bg=BG_CARD,
                 fg=TEXT_DIM, font=("Segoe UI", 7)).pack(side="left", padx=(8, 0))

        wd_card = tk.Frame(opts_row, bg=BG_CARD, highlightbackground=BORDER,
                           highlightthickness=1, padx=10, pady=5)
        wd_card.pack(side="left")
        tk.Checkbutton(
            wd_card, text="🛡  Auto-reiniciar se travar",
            variable=self.watchdog_var,
            bg=BG_CARD, fg=TEXT, selectcolor=BG,
            activebackground=BG_CARD, activeforeground=ACCENT,
            font=("Segoe UI", 9), cursor="hand2",
            command=self._on_watchdog_toggle,
        ).pack(side="left")
        self.lbl_watchdog = tk.Label(
            wd_card, text="off", bg=BG_CARD, fg=TEXT_DIM, font=("Segoe UI", 8),
        )
        self.lbl_watchdog.pack(side="left", padx=(6, 0))

        # ── Botões (responsivos, altura dobrada, fonte auto-ajustável) ────
        self.btn_row = tk.Frame(r, bg=BG, padx=14, pady=6)
        self.btn_row.pack(fill="x")

        btn_specs = [
            ("▶  Iniciar Local",   self.start_local,    "accent"),
            ("🌐  Iniciar Túnel",  self.start_tunnel,   "default"),
            ("🔄  Reset Local",    self.reset_local,    "default"),
            ("⏹  Parar tudo",     self.stop_all,       "danger"),
            ("🌍  Abrir browser",  self.open_browser,   "default"),
            ("📋  Copiar URL",     self.copy_tunnel_url, "default"),
            ("🔍  Verificar",      self.run_verify,     "default"),
            ("🧹  Limpar log",     self.clear_log,      "default"),
        ]
        self._buttons: list[tk.Button] = []
        for i in range(len(btn_specs)):
            self.btn_row.columnconfigure(i, weight=1, uniform="btnrow")
        for i, (text, cmd, kind) in enumerate(btn_specs):
            btn = self._make_button(self.btn_row, text, cmd, kind=kind)
            btn.grid(row=0, column=i, padx=3, sticky="ew")
            self._buttons.append(btn)

        # Refs nomeadas (compatibilidade com código existente)
        (self.btn_local, self.btn_tunnel, self.btn_reset, self.btn_stop,
         self.btn_open, self.btn_copy_url, self.btn_verify, self.btn_clear) = self._buttons

        # Estado para fonte responsiva (cache do tamanho atual para evitar reconfig spam)
        self._btn_current_font_size = 10

        # ── Conteúdo principal: PanedWindow horizontal (log │ direita) ────
        # Sash de 8px com bg=BG: visualmente idêntico ao gap atual,
        # mas agora é zona arrastável (e double-click reseta).
        self._pw_main = tk.PanedWindow(
            r, orient="horizontal",
            sashwidth=8, sashrelief="flat", sashpad=0,
            bg=BG, borderwidth=0, showhandle=False, opaqueresize=False,
        )
        self._pw_main.pack(fill="both", expand=True, padx=14, pady=8)

        # Log (esquerda)
        log_card = tk.Frame(self._pw_main, bg=BG_CARD, highlightbackground=BORDER, highlightthickness=1)
        tk.Label(log_card, text="📜  Log da sessão", bg=BG_CARD, fg=ACCENT,
                 font=("Segoe UI", 10, "bold"), anchor="w").pack(fill="x", padx=10, pady=(8, 4))
        log_wrap = tk.Frame(log_card, bg=BG_CARD)
        log_wrap.pack(fill="both", expand=True, padx=8, pady=(0, 8))
        self.log_text = tk.Text(
            log_wrap, bg="#0a0c12", fg=TEXT, insertbackground=TEXT, relief="flat",
            font=("Consolas", 9), wrap="word", borderwidth=0, padx=8, pady=6,
        )
        self.log_text.pack(side="left", fill="both", expand=True)
        sb = ttk.Scrollbar(log_wrap, command=self.log_text.yview)
        sb.pack(side="right", fill="y")
        self.log_text.configure(yscrollcommand=sb.set, state="disabled")
        # tags
        self.log_text.tag_config("info", foreground=INFO)
        self.log_text.tag_config("ok", foreground=OK)
        self.log_text.tag_config("warn", foreground=WARN)
        self.log_text.tag_config("err", foreground=ERR)
        self.log_text.tag_config("dim", foreground=TEXT_DIM)
        self.log_text.tag_config("local", foreground="#a5d8ff")
        self.log_text.tag_config("tunnel", foreground="#c9a96e")
        self.log_text.tag_config("verify", foreground="#d8b4fe")
        self.log_text.tag_config("ts", foreground="#5b6478")
        self._pw_main.add(log_card, minsize=240, stretch="always")

        # Painel direito: PanedWindow vertical (HW │ Tempos)
        self._pw_right = tk.PanedWindow(
            self._pw_main, orient="vertical",
            sashwidth=8, sashrelief="flat", sashpad=0,
            bg=BG, borderwidth=0, showhandle=False, opaqueresize=False,
        )
        self._pw_main.add(self._pw_right, minsize=220, stretch="always")

        # Hardware (topo direito)
        hw_card = tk.Frame(self._pw_right, bg=BG_CARD, highlightbackground=BORDER, highlightthickness=1)
        tk.Label(hw_card, text="📊  Hardware / uso", bg=BG_CARD, fg=ACCENT,
                 font=("Segoe UI", 10, "bold"), anchor="w").pack(fill="x", padx=10, pady=(8, 4))
        self.lbl_cpu  = self._make_metric_row(hw_card, "CPU")
        self.lbl_ram  = self._make_metric_row(hw_card, "RAM")
        self.lbl_disk = self._make_metric_row(hw_card, "Disco")
        self._gpu_container = tk.Frame(hw_card, bg=BG_CARD)
        self._gpu_container.pack(fill="x")
        self.lbl_node = tk.Label(
            hw_card, text="Procs: —", bg=BG_CARD, fg=TEXT_DIM, anchor="w",
            font=("Segoe UI", 8), padx=10, pady=4,
        )
        self.lbl_node.pack(fill="x")
        if not getattr(self.hw, "_psutil", None):
            tk.Label(
                hw_card, text="(instale 'psutil' para métricas mais precisas)",
                bg=BG_CARD, fg=TEXT_DIM, font=("Segoe UI", 7), anchor="w", padx=10,
            ).pack(fill="x", pady=(0, 6))
        self._pw_right.add(hw_card, minsize=140, stretch="always")

        # Timings (baixo direito)
        tm_card = tk.Frame(self._pw_right, bg=BG_CARD, highlightbackground=BORDER, highlightthickness=1)
        tk.Label(tm_card, text="⏱  Tempos das operações", bg=BG_CARD, fg=ACCENT,
                 font=("Segoe UI", 10, "bold"), anchor="w").pack(fill="x", padx=10, pady=(8, 4))
        tm_wrap = tk.Frame(tm_card, bg=BG_CARD)
        tm_wrap.pack(fill="both", expand=True, padx=8, pady=(0, 8))
        self.timings_text = tk.Text(
            tm_wrap, bg="#0a0c12", fg=TEXT, relief="flat", font=("Consolas", 9),
            wrap="none", borderwidth=0, padx=8, pady=6, height=8,
        )
        self.timings_text.pack(side="left", fill="both", expand=True)
        tsb = ttk.Scrollbar(tm_wrap, command=self.timings_text.yview)
        tsb.pack(side="right", fill="y")
        self.timings_text.configure(yscrollcommand=tsb.set, state="disabled")
        self.timings_text.tag_config("ok", foreground=OK)
        self.timings_text.tag_config("err", foreground=ERR)
        self.timings_text.tag_config("dim", foreground=TEXT_DIM)
        self.timings_text.tag_config("ts", foreground=ACCENT)
        self._pw_right.add(tm_card, minsize=100, stretch="always")

        # Razões padrão para os sashes (double-click → reseta)
        self._sash_main_default  = 0.72   # 72% para o log
        self._sash_right_default = 0.50   # 50% para Hardware

        # Bind double-click — só reseta se o clique foi no widget PanedWindow
        # diretamente (i.e. no sash, não em um filho)
        def _dclick_main(event):
            if event.widget is self._pw_main:
                self._reset_sash(self._pw_main, 0, "horizontal", self._sash_main_default)
        def _dclick_right(event):
            if event.widget is self._pw_right:
                self._reset_sash(self._pw_right, 0, "vertical", self._sash_right_default)
        self._pw_main.bind("<Double-Button-1>", _dclick_main)
        self._pw_right.bind("<Double-Button-1>", _dclick_right)

        # Aplica posições padrão dos sashes assim que a janela tiver tamanho
        self.root.after(60, self._apply_default_sashes)

        # Footer
        footer = tk.Frame(r, bg=BG, padx=14, pady=6)
        footer.pack(fill="x")
        self.lbl_status = tk.Label(footer, text="Pronto.", bg=BG, fg=TEXT_DIM, font=("Segoe UI", 8), anchor="w")
        self.lbl_status.pack(side="left")
        tk.Label(
            footer, text=f"Python {sys.version.split()[0]} · Tk {tk.TkVersion}  ·  duplo-clique nas linhas finas para resetar painéis",
            bg=BG, fg=TEXT_DIM, font=("Segoe UI", 8),
        ).pack(side="right")

        r.protocol("WM_DELETE_WINDOW", self._on_close)

        # Responsividade dos botões: ajusta fonte ao redimensionar a linha
        self.btn_row.bind("<Configure>", self._on_btn_resize)

    # ----------------------------------------------------------- Botões
    def _make_button(self, parent, text, command, kind="default") -> tk.Button:
        if kind == "accent":
            bg, fg, abg, afg = ACCENT, "#1b1408", "#daba80", "#1b1408"
        elif kind == "danger":
            bg, fg, abg, afg = "#3a1f24", "#ffb6b6", "#5a2b32", "#ffd0d0"
        else:
            bg, fg, abg, afg = BG_CARD, TEXT, "#2a3142", TEXT
        return tk.Button(
            parent, text=text, command=command,
            bg=bg, fg=fg,
            activebackground=abg, activeforeground=afg,
            relief="flat", borderwidth=0, highlightthickness=0,
            cursor="hand2",
            padx=8, pady=14,                  # altura ~2x da versão anterior
            font=("Segoe UI", 10, "bold"),
            wraplength=0,                     # nunca quebra linha — fonte encolhe em vez disso
        )

    def _on_btn_resize(self, event=None) -> None:
        """Handler de <Configure> — DEBOUNCED. Apenas agenda um cálculo
        após 60ms de inatividade, em vez de rodar a cada pixel do drag."""
        if self._btn_resize_after_id is not None:
            try:
                self.root.after_cancel(self._btn_resize_after_id)
            except Exception:
                pass
        self._btn_resize_after_id = self.root.after(60, self._do_btn_resize)

    def _do_btn_resize(self) -> None:
        """Executa o ajuste de fonte. Caches evitam recriação de Font e
        remedição de texto a cada chamada — drag de janela vira ~O(1)."""
        self._btn_resize_after_id = None
        if not getattr(self, "_buttons", None):
            return
        try:
            row_w = self.btn_row.winfo_width()
        except Exception:
            return
        if row_w < 80:
            return
        # Curto-circuito: se a largura praticamente não mudou, não faz nada.
        if abs(row_w - self._last_btn_row_w) < 3:
            return
        self._last_btn_row_w = row_w

        import tkinter.font as tkfont
        n = len(self._buttons)
        per_btn_avail = max(40, (row_w // n) - 16)

        # Busca o maior tamanho (11..6) que cabe — usa caches.
        chosen = 6
        for size in range(11, 5, -1):
            f = self._btn_fonts.get(size)
            if f is None:
                try:
                    f = tkfont.Font(family="Segoe UI", size=size, weight="bold")
                except Exception:
                    continue
                self._btn_fonts[size] = f
            ok = True
            for b in self._buttons:
                txt = b.cget("text")
                key = (size, txt)
                tw = self._btn_text_w.get(key)
                if tw is None:
                    tw = f.measure(txt)
                    self._btn_text_w[key] = tw
                if tw + 16 > per_btn_avail:
                    ok = False
                    break
            if ok:
                chosen = size
                break

        if chosen != self._btn_current_font_size:
            self._btn_current_font_size = chosen
            new_font = ("Segoe UI", chosen, "bold")
            for b in self._buttons:
                b.configure(font=new_font)

    # ----------------------------------------------------------- Sashes
    def _apply_default_sashes(self) -> None:
        try:
            self._reset_sash(self._pw_main,  0, "horizontal", self._sash_main_default)
            self._reset_sash(self._pw_right, 0, "vertical",   self._sash_right_default)
        except Exception:
            pass

    def _reset_sash(self, pw: tk.PanedWindow, index: int, orient: str, ratio: float) -> None:
        """Coloca o sash na razão definida (0..1). Animado curtinho via after()."""
        try:
            pw.update_idletasks()
            if orient == "horizontal":
                w = pw.winfo_width()
                if w > 50:
                    pw.sash_place(index, int(w * ratio), 0)
            else:
                h = pw.winfo_height()
                if h > 50:
                    pw.sash_place(index, 0, int(h * ratio))
        except Exception:
            pass

    def _make_status_card(self, parent, title, value, side="left", wide=False) -> dict:
        card = tk.Frame(parent, bg=BG_CARD, highlightbackground=BORDER, highlightthickness=1)
        card.pack(side=side, padx=4, fill="both", expand=wide)
        tk.Label(card, text=title, bg=BG_CARD, fg=TEXT_DIM, font=("Segoe UI", 8), anchor="w", padx=10).pack(fill="x", pady=(6, 0))
        lbl_value = tk.Label(card, text=value, bg=BG_CARD, fg=TEXT, font=("Segoe UI", 11, "bold"), anchor="w", padx=10)
        lbl_value.pack(fill="x", pady=(0, 8))
        # bolinha de status
        dot = tk.Canvas(card, width=10, height=10, bg=BG_CARD, highlightthickness=0)
        dot.place(relx=1.0, x=-12, y=8, anchor="ne")
        circ = dot.create_oval(1, 1, 9, 9, fill=TEXT_DIM, outline=TEXT_DIM)
        return {"frame": card, "value": lbl_value, "dot": dot, "circ": circ}

    def _set_status(self, card: dict, value: str, color: str) -> None:
        card["value"].configure(text=value)
        card["dot"].itemconfig(card["circ"], fill=color, outline=color)

    def _make_metric_row(self, parent, label) -> dict:
        row = tk.Frame(parent, bg=BG_CARD)
        row.pack(fill="x", padx=10, pady=4)
        tk.Label(row, text=label, bg=BG_CARD, fg=TEXT_DIM, font=("Segoe UI", 8), width=6, anchor="w").pack(side="left")
        bar_frame = tk.Frame(row, bg=BG_PANEL, height=10)
        bar_frame.pack(side="left", fill="x", expand=True, padx=(4, 6))
        bar = tk.Frame(bar_frame, bg=ACCENT, height=10, width=0)
        bar.place(x=0, y=0, relheight=1)
        val = tk.Label(row, text="—", bg=BG_CARD, fg=TEXT, font=("Segoe UI", 8, "bold"), width=18, anchor="e")
        val.pack(side="right")
        return {"bar": bar, "frame": bar_frame, "val": val}

    def _set_metric(self, m: dict, pct: float, text: str) -> None:
        pct = max(0, min(100, pct))
        try:
            w = m["frame"].winfo_width()
            if w > 0:
                m["bar"].place_configure(width=int(w * pct / 100))
        except Exception:
            pass
        color = OK if pct < 60 else (WARN if pct < 85 else ERR)
        m["bar"].configure(bg=color)
        m["val"].configure(text=text)

    # ------------------------------------------------------------- Logging
    def log(self, channel: str, msg: str, level: str = "") -> None:
        self.queue.put(("log", channel, msg, level))

    def _append_log(self, channel: str, msg: str, level: str) -> None:
        ts = time.strftime("%H:%M:%S")
        self.log_text.configure(state="normal")
        self.log_text.insert("end", f"[{ts}] ", "ts")
        tag = level if level else channel
        prefix = {"local": "node ", "tunnel": "cf   ", "verify": "vrfy ", "ui": "     "}.get(channel, channel + " ")
        self.log_text.insert("end", prefix, "dim")
        self.log_text.insert("end", msg + "\n", tag)
        # Limite de 5000 linhas
        line_count = int(self.log_text.index("end-1c").split(".")[0])
        if line_count > 5000:
            self.log_text.delete("1.0", f"{line_count - 5000}.0")
        self.log_text.see("end")
        self.log_text.configure(state="disabled")

    def add_timing(self, label: str, duration: float, ok: bool = True) -> None:
        self.timings.append((label, duration, "ok" if ok else "err"))
        self.queue.put(("timing", label, duration, "ok" if ok else "err"))

    def _append_timing(self, label: str, duration: float, status: str) -> None:
        ts = time.strftime("%H:%M:%S")
        icon = "✓" if status == "ok" else "✗"
        self.timings_text.configure(state="normal")
        self.timings_text.insert("end", f"[{ts}] ", "ts")
        self.timings_text.insert("end", f"{icon} {label:<28}", "dim")
        self.timings_text.insert("end", f" {fmt_dur(duration):>10}\n", status)
        self.timings_text.see("end")
        self.timings_text.configure(state="disabled")

    def clear_log(self) -> None:
        self.log_text.configure(state="normal")
        self.log_text.delete("1.0", "end")
        self.log_text.configure(state="disabled")

    # --------------------------------------------------------- Polling loops
    def _poll_queue(self) -> None:
        try:
            while True:
                ev = self.queue.get_nowait()
                if ev[0] == "log":
                    _, ch, msg, lvl = ev
                    self._append_log(ch, msg, lvl)
                elif ev[0] == "timing":
                    _, label, dur, status = ev
                    self._append_timing(label, dur, status)
        except queue.Empty:
            pass
        self.root.after(50, self._poll_queue)

    def _poll_status(self) -> None:
        # Uptime de sessão
        self.lbl_uptime.configure(text=f"sessão {fmt_dur(time.time() - self.session_start)}")

        # Local server
        if self.local_proc and self.local_proc.is_running():
            elapsed = time.time() - (self.local_started_at or time.time())
            actual_url = f"http://localhost:{self.actual_port}"
            if not self.ready_local:
                # Checa http na porta real (pode ter mudado de 3000 para 3001 etc.)
                if http_ready(actual_url):
                    self.ready_local = True
                    self._set_status(self.card_local, f":{self.actual_port} pronto · {fmt_dur(elapsed)}", OK)
                    self.add_timing(f"local :{self.actual_port} pronto p/ requests", elapsed, ok=True)
                    self.log("ui", f"Servidor local respondeu em {fmt_dur(elapsed)} → {actual_url}", level="ok")
                else:
                    self._set_status(self.card_local, f":{self.actual_port} subindo · {fmt_dur(elapsed)}", WARN)
            else:
                self._set_status(self.card_local, f":{self.actual_port} online · {fmt_dur(elapsed)}", OK)
        elif self.local_proc:
            self._set_status(self.card_local, "encerrado", ERR)
            self.local_proc = None
            self.local_started_at = None
            self.ready_local = False
        else:
            self._set_status(self.card_local, "parado", TEXT_DIM)

        # Tunnel
        if self.tunnel_proc and self.tunnel_proc.is_running():
            elapsed = time.time() - (self.tunnel_started_at or time.time())
            if self.ready_tunnel_url:
                self._set_status(self.card_tunnel, f"online · {fmt_dur(elapsed)}", OK)
                self._set_status(self.card_url, self.ready_tunnel_url, OK)
            else:
                self._set_status(self.card_tunnel, f"abrindo · {fmt_dur(elapsed)}", WARN)
        elif self.tunnel_proc:
            self._set_status(self.card_tunnel, "encerrado", ERR)
            self.tunnel_proc = None
            self.tunnel_started_at = None
            self.ready_tunnel_url = None
            self._set_status(self.card_url, "—", TEXT_DIM)
        else:
            self._set_status(self.card_tunnel, "parado", TEXT_DIM)
            if not self.ready_tunnel_url:
                self._set_status(self.card_url, "—", TEXT_DIM)

        self.root.after(500, self._poll_status)

    def _poll_hw(self) -> None:
        try:
            cpu = self.hw.cpu_percent()
            self._set_metric(self.lbl_cpu, cpu, f"{cpu:5.1f} %")

            ram_pct, used, total = self.hw.memory()
            self._set_metric(self.lbl_ram, ram_pct, f"{fmt_bytes(used)} / {fmt_bytes(total)}")

            disk_pct, du, dt = self.hw.disk(str(ROOT))
            self._set_metric(self.lbl_disk, disk_pct, f"{fmt_bytes(dt - du)} livre")

            # GPU — cria rows uma única vez no container dedicado
            gpus = self.hw.gpu()
            container = getattr(self, "_gpu_container", None)
            if gpus and container is not None:
                n = len(gpus)
                # Sanity: nunca cria mais que o detectado e nunca mais que 8
                if len(self._gpu_rows) < n and len(self._gpu_rows) < 8:
                    while len(self._gpu_rows) < n:
                        idx = len(self._gpu_rows)
                        gpu_label  = "GPU" if n == 1 else f"GPU{idx}"
                        vram_label = "VRAM" if n == 1 else f"VRAM{idx}"
                        try:
                            row_gpu  = self._make_metric_row(container, gpu_label)
                            row_vram = self._make_metric_row(container, vram_label)
                        except Exception:
                            break  # se algo der errado, não loopa indefinidamente
                        self._gpu_rows.append({
                            "gpu": row_gpu, "vram": row_vram, "name": gpus[idx]["name"],
                        })
                # Atualiza valores
                for i, g in enumerate(gpus):
                    if i >= len(self._gpu_rows):
                        break
                    r = self._gpu_rows[i]
                    util = g["util_pct"]
                    vu, vt = g["vram_used"], g["vram_total"]
                    vp = (vu / vt * 100) if vt else 0
                    self._set_metric(r["gpu"],  util, f"{util:5.1f} %")
                    self._set_metric(r["vram"], vp,   f"{fmt_bytes(vu)} / {fmt_bytes(vt)}")

            # Procs ativos
            running = []
            if self.local_proc and self.local_proc.is_running():
                running.append(f"local :{self.actual_port}")
            if self.tunnel_proc and self.tunnel_proc.is_running():
                running.append("túnel")
            if self.verify_proc and self.verify_proc.is_running():
                running.append("verify")
            self.lbl_node.configure(text="Procs: " + (" · ".join(running) if running else "nenhum"))
        except Exception:
            pass
        self.root.after(1000, self._poll_hw)

    # --------------------------------------------------------- Process hooks
    def _local_line(self, channel: str, line: str) -> None:
        self.log("local", line, level="local")
        # Detecta porta real — Next imprime "- Local: http://localhost:XXXX"
        # Isso acontece ANTES do "Ready", então capturamos cedo.
        m = NEXT_PORT_RE.search(line)
        if m:
            detected = int(m.group(1))
            if detected != self.actual_port:
                self.actual_port = detected
                self.log(
                    "ui",
                    f"⚠️  Porta {PORT} ocupada — Next.js subiu na {detected}. "
                    f"Túnel e browser redirecionados para http://localhost:{detected}",
                    level="warn",
                )

    def _tunnel_line(self, channel: str, line: str) -> None:
        self.log("tunnel", line, level="tunnel")
        if not self.ready_tunnel_url:
            m = URL_RE.search(line)
            if m:
                url = m.group(0)
                self.ready_tunnel_url = url
                elapsed = time.time() - (self.tunnel_started_at or time.time())
                self.add_timing("túnel: URL pública pronta", elapsed, ok=True)
                self.log("ui", f"URL pública pronta em {fmt_dur(elapsed)}: {url}", level="ok")

    def _verify_line(self, channel: str, line: str) -> None:
        self.log("verify", line, level="verify")

    # ---------------------------------------------------------- Ações
    def start_local(self) -> None:
        if self.local_proc and self.local_proc.is_running():
            self.log("ui", "Servidor local já está rodando.", level="warn")
            return
        npm = find_npm()
        if not npm:
            messagebox.showerror("npm não encontrado", "Instale o Node.js e garanta que 'npm' esteja no PATH.")
            return
        mode = self.mode_var.get()
        if mode == "start":
            cmd = [npm, "start"]
            mode_label = "produção (next start)"
        elif mode == "build_start":
            cmd = [npm, "run", "start:prod"]
            mode_label = "build + produção (next build && next start)"
        else:
            cmd = [npm, "run", "dev"]
            mode_label = "dev (hot reload)"
        self.local_started_at = time.time()
        self.ready_local = False
        self.local_proc = ManagedProc("local", cmd, str(ROOT), self._local_line)
        try:
            self.local_proc.start()
            self.log("ui", f"Iniciando servidor local [{mode_label}]: {' '.join(cmd)}", level="info")
            self.lbl_status.configure(text=f"Servidor local subindo… ({LOCAL_URL})")
            self._start_watchdog()
        except Exception as e:
            self.log("ui", f"Falha ao iniciar local: {e}", level="err")

    def start_tunnel(self) -> None:
        if self.tunnel_proc and self.tunnel_proc.is_running():
            self.log("ui", "Túnel já está rodando.", level="warn")
            return
        cf = find_cloudflared()
        if not cf:
            messagebox.showerror(
                "cloudflared não encontrado",
                "Instale via 'winget install Cloudflare.cloudflared' "
                "ou coloque cloudflared.exe na raiz do projeto.",
            )
            return
        if not self.local_proc or not self.local_proc.is_running():
            self.log("ui", "Servidor local não detectado. Iniciando antes do túnel…", level="info")
            self.start_local()
            # espera pronto em background
            threading.Thread(target=self._wait_local_then_tunnel, args=(cf,), daemon=True).start()
            return
        if not self.ready_local:
            self.log("ui", "Aguardando local responder antes de abrir o túnel…", level="info")
            threading.Thread(target=self._wait_local_then_tunnel, args=(cf,), daemon=True).start()
            return
        self._spawn_tunnel(cf)

    def _wait_local_then_tunnel(self, cf: str) -> None:
        deadline = time.time() + 120
        while time.time() < deadline:
            actual_url = f"http://localhost:{self.actual_port}"
            if self.ready_local or http_ready(actual_url):
                self.ready_local = True
                break
            time.sleep(0.5)
        if not self.ready_local:
            self.log("ui", "Timeout esperando local — não vou abrir o túnel.", level="err")
            return
        self.root.after(0, lambda: self._spawn_tunnel(cf))

    def _spawn_tunnel(self, cf: str) -> None:
        actual_url = f"http://localhost:{self.actual_port}"
        cmd = [cf, "tunnel", "--url", actual_url]
        self.tunnel_started_at = time.time()
        self.ready_tunnel_url = None
        self.tunnel_proc = ManagedProc("tunnel", cmd, str(ROOT), self._tunnel_line)
        try:
            self.tunnel_proc.start()
            self.log("ui", f"Iniciando túnel → {actual_url}: {' '.join(cmd)}", level="info")
            self.lbl_status.configure(text="Aguardando URL pública do Cloudflare…")
        except Exception as e:
            self.log("ui", f"Falha ao iniciar túnel: {e}", level="err")

    def reset_local(self) -> None:
        """Reinicia APENAS o servidor local.
        O túnel continua rodando. Se o Next.js subir na mesma porta, o túnel
        segue funcionando e a URL pública é preservada. Se mudar de porta,
        o túnel é respawnado automaticamente."""
        if not self.local_proc and not self.tunnel_proc:
            self.log("ui", "Nada para resetar.", level="warn")
            return
        threading.Thread(target=self._reset_local_thread, daemon=True).start()

    def _reset_local_thread(self) -> None:
        self._stop_watchdog()
        t0 = time.time()
        port_before = self.actual_port
        had_tunnel  = self.tunnel_proc is not None and self.tunnel_proc.is_running()

        # 1. Para apenas o local
        self.log("ui", "Reset: encerrando servidor local…", level="info")
        if self.local_proc:
            self.local_proc.stop()
        self.local_proc = None
        self.ready_local = False
        self.local_started_at = None
        self.actual_port = PORT   # vai ser re-detectado no output do Next.js

        # 2. Limpa cache .next (apenas no modo dev — prod não usa HMR e não corrompe)
        mode = self.mode_var.get()
        next_dir = ROOT / ".next"
        if mode == "dev" and next_dir.exists():
            self.log("ui", "Limpando cache .next/ …", level="info")
            try:
                shutil.rmtree(next_dir, ignore_errors=True)
            except Exception as e:
                self.log("ui", f"Aviso ao remover .next: {e}", level="warn")
        elif mode != "dev":
            self.log("ui", "Modo produção — mantendo .next/ (sem limpeza).", level="info")

        # 3. Reinicia local
        time.sleep(0.4)
        self.root.after(0, self.start_local)

        # 4. Espera local ficar pronto para verificar se a porta mudou
        if had_tunnel:
            deadline = time.time() + 120
            while time.time() < deadline:
                actual_url = f"http://localhost:{self.actual_port}"
                if self.ready_local or http_ready(actual_url):
                    self.ready_local = True
                    break
                time.sleep(0.5)

            if not self.ready_local:
                self.log("ui", "Reset: timeout esperando local — túnel mantido.", level="warn")
            elif self.actual_port != port_before:
                # Porta mudou → precisa respawnar o túnel para apontar para a nova porta
                self.log(
                    "ui",
                    f"Reset: porta mudou {port_before} → {self.actual_port}. "
                    f"Respawnando túnel (URL pública será nova)…",
                    level="warn",
                )
                if self.tunnel_proc:
                    self.tunnel_proc.stop()
                self.tunnel_proc = None
                self.tunnel_started_at = None
                self.ready_tunnel_url = None
                cf = find_cloudflared()
                if cf:
                    self.root.after(0, lambda: self._spawn_tunnel(cf))
            else:
                # Mesma porta → túnel continua funcionando normalmente
                self.log(
                    "ui",
                    f"Reset: porta mantida (:{self.actual_port}). "
                    f"Túnel segue ativo, URL pública preservada.",
                    level="ok",
                )

        elapsed = time.time() - t0
        self.add_timing("reset local (kill+limpa+restart)", elapsed, ok=True)
        self.log("ui", f"Reset concluído em {fmt_dur(elapsed)}.", level="ok")

    def stop_all(self) -> None:
        self._stop_watchdog()
        any_alive = (
            (self.local_proc and self.local_proc.is_running())
            or (self.tunnel_proc and self.tunnel_proc.is_running())
            or (self.verify_proc and self.verify_proc.is_running())
        )
        if not any_alive:
            self.log("ui", "Nada rodando.", level="dim")
            return
        if self.tunnel_proc:
            self.tunnel_proc.stop()
            self.log("ui", "Túnel encerrado.", level="info")
        if self.local_proc:
            self.local_proc.stop()
            self.log("ui", "Local encerrado.", level="info")
        if self.verify_proc:
            self.verify_proc.stop()
            self.log("ui", "Verify encerrado.", level="info")
        self.local_proc = None
        self.tunnel_proc = None
        self.verify_proc = None
        self.ready_local = False
        self.ready_tunnel_url = None

    def copy_tunnel_url(self) -> None:
        """Copia a URL pública do túnel para a área de transferência."""
        url = self.ready_tunnel_url
        if not url:
            self.log("ui", "Túnel ainda não tem URL — aguarde o Cloudflare conectar.", level="warn")
            return
        try:
            self.root.clipboard_clear()
            self.root.clipboard_append(url)
            self.root.update()
            self.log("ui", f"URL copiada: {url}", level="ok")
            # Feedback visual temporário no botão
            self.btn_copy_url.configure(text="✅  Copiado!")
            self.root.after(2000, lambda: self.btn_copy_url.configure(text="📋  Copiar URL"))
        except Exception as e:
            self.log("ui", f"Falha ao copiar: {e}", level="err")

    def open_browser(self) -> None:
        url = self.ready_tunnel_url or f"http://localhost:{self.actual_port}"
        webbrowser.open(url)
        self.log("ui", f"Abrindo {url} no navegador.", level="info")

    def run_verify(self) -> None:
        if self.verify_proc and self.verify_proc.is_running():
            self.log("ui", "Verificação já está rodando.", level="warn")
            return
        node = find_node()
        if not node:
            messagebox.showerror("Node não encontrado", "Node.js precisa estar no PATH.")
            return
        script = ROOT / "scripts" / "verify-deep.js"
        if not script.exists():
            messagebox.showerror("verify-deep.js não encontrado", str(script))
            return
        cmd = [node, str(script)]
        env_msg = "(headless · porta dedicada 3199)"
        self.verify_proc = ManagedProc("verify", cmd, str(ROOT), self._verify_line)
        # Carrega env próprio para que o Verify use as vars certas
        os.environ["VERIFY_HEADLESS"] = "1"
        t_start = time.time()
        try:
            self.verify_proc.start()
            self.log("ui", f"🔍 Iniciando verify-deep {env_msg}", level="info")
            threading.Thread(target=self._wait_verify_done, args=(t_start,), daemon=True).start()
        except Exception as e:
            self.log("ui", f"Falha ao iniciar verify: {e}", level="err")

    def _wait_verify_done(self, t_start: float) -> None:
        if not self.verify_proc or not self.verify_proc.proc:
            return
        rc = self.verify_proc.proc.wait()
        elapsed = time.time() - t_start
        self.add_timing("verify-deep (auditoria)", elapsed, ok=(rc == 0))
        report_md = ROOT / "reports" / "verify-deep-latest.md"
        if rc == 0:
            self.log("ui", f"✅ Verificação concluída em {fmt_dur(elapsed)}.", level="ok")
        else:
            self.log("ui", f"⚠️ Verificação terminou com código {rc} em {fmt_dur(elapsed)}.", level="err")
        if report_md.exists():
            self.log("ui", f"📄 Relatório: {report_md}", level="info")
            self._summarize_report(report_md)

    def _summarize_report(self, md: Path) -> None:
        try:
            text = md.read_text(encoding="utf-8")
        except Exception as e:
            self.log("ui", f"Não foi possível abrir o relatório: {e}", level="warn")
            return
        # Pega primeiras 25 linhas com algum conteúdo
        lines = [l for l in text.splitlines() if l.strip()][:30]
        self.log("ui", "── Resumo do relatório ──────────────────", level="info")
        for l in lines:
            self.log("verify", l, level="verify")
        self.log("ui", "─────────────────────────────────────────", level="info")

    # --------------------------------------------------------------- Watchdog
    def _on_watchdog_toggle(self) -> None:
        if self.watchdog_var.get():
            if self.local_proc and self.local_proc.is_running():
                self._start_watchdog()
            else:
                self.lbl_watchdog.configure(text="aguarda start", fg=TEXT_DIM)
        else:
            self._stop_watchdog()
            self.lbl_watchdog.configure(text="off", fg=TEXT_DIM)

    def _start_watchdog(self) -> None:
        """Inicia o watchdog se o toggle estiver ativo e não já rodando."""
        if not self.watchdog_var.get():
            return
        if self._watchdog_thread and self._watchdog_thread.is_alive():
            return
        self._watchdog_stop_event.clear()
        self._watchdog_consec_fail = 0
        self._watchdog_thread = threading.Thread(target=self._watchdog_loop, daemon=True)
        self._watchdog_thread.start()
        self.log("ui", "🛡 Watchdog ativo — verifica GET / a cada 60s; reinicia após 3 falhas 500.", level="info")

    def _stop_watchdog(self) -> None:
        self._watchdog_stop_event.set()

    def _watchdog_loop(self) -> None:
        """Health-check em thread daemon. Reinicia o servidor após MAX_FAIL 500s consecutivos."""
        INTERVAL = 60   # segundos entre cada verificação
        MAX_FAIL  = 3   # falhas 500 consecutivas antes de reiniciar

        def _set_wd_label(text: str, color: str) -> None:
            if hasattr(self, "lbl_watchdog"):
                self.root.after(0, lambda t=text, c=color: self.lbl_watchdog.configure(text=t, fg=c))

        # Espera servidor ficar pronto (até 3 min)
        wait_deadline = time.time() + 180
        while not self._watchdog_stop_event.is_set() and time.time() < wait_deadline:
            if self.ready_local:
                break
            time.sleep(2)

        if self._watchdog_stop_event.is_set():
            _set_wd_label("off", TEXT_DIM)
            return
        if not self.ready_local:
            _set_wd_label("timeout aguard. start", WARN)
            return

        self._watchdog_consec_fail = 0
        _set_wd_label(f"OK {time.strftime('%H:%M')}", OK)

        while not self._watchdog_stop_event.is_set():
            # Dorme em fatias de 5s para reagir rápido ao stop
            for _ in range(INTERVAL // 5):
                if self._watchdog_stop_event.is_set():
                    break
                time.sleep(5)

            if self._watchdog_stop_event.is_set():
                break

            # Processo ainda vivo?
            if not self.local_proc or not self.local_proc.is_running():
                _set_wd_label("processo encerrado", TEXT_DIM)
                break

            url = f"http://localhost:{self.actual_port}"
            status = None
            try:
                req = urllib.request.Request(url, method="GET")
                with urllib.request.urlopen(req, timeout=5) as resp:
                    status = resp.status
            except urllib.error.HTTPError as e:
                status = e.code
            except urllib.error.URLError:
                # Conexão recusada / timeout de rede — servidor pode estar reiniciando
                _set_wd_label(f"sem resp. {time.strftime('%H:%M')}", WARN)
                continue
            except Exception:
                continue

            ts = time.strftime("%H:%M")
            if status is not None and status >= 500:
                self._watchdog_consec_fail += 1
                fail = self._watchdog_consec_fail
                _set_wd_label(f"⚠ {status} ({fail}/{MAX_FAIL}) {ts}", ERR)
                self.log("ui", f"🛡 Watchdog: HTTP {status} (falha {fail}/{MAX_FAIL}) — {url}", level="warn")
                if fail >= MAX_FAIL:
                    self.log("ui", f"🛡 Watchdog: {MAX_FAIL} falhas consecutivas → reiniciando servidor…", level="err")
                    self._watchdog_consec_fail = 0
                    self._watchdog_stop_event.set()   # para este loop antes do reset
                    self.root.after(0, self.reset_local)
                    break
            else:
                self._watchdog_consec_fail = 0
                _set_wd_label(f"OK {ts}", OK)

        _set_wd_label("off", TEXT_DIM)

    # --------------------------------------------------------------- Close
    def _on_close(self) -> None:
        self._stop_watchdog()
        if (self.local_proc and self.local_proc.is_running()) or (self.tunnel_proc and self.tunnel_proc.is_running()):
            if not messagebox.askyesno("Sair", "Há processos rodando. Encerrar tudo e sair?"):
                return
        self.stop_all()
        # da tempo dos kills
        time.sleep(0.2)
        try:
            self.root.destroy()
        except Exception:
            pass


def _apply_dpi_awareness() -> None:
    """Torna o processo DPI-aware no Windows para tela nítida em monitores 4K/HiDPI.
    Deve ser chamado ANTES de criar qualquer janela Tk."""
    if not IS_WINDOWS:
        return
    try:
        # Windows 8.1+ — PROCESS_PER_MONITOR_DPI_AWARE (melhor para 4K)
        ctypes.windll.shcore.SetProcessDpiAwareness(2)
        return
    except (AttributeError, OSError):
        pass
    try:
        # Windows Vista+ — System DPI awareness (fallback)
        ctypes.windll.user32.SetProcessDPIAware()
    except (AttributeError, OSError):
        pass


def _force_taskbar(root: tk.Tk) -> None:
    """Garante que a janela apareça na barra de tarefas do Windows.
    Necessário quando o processo não tem um ícone de taskbar nativo
    (e.g. pythonw.exe ou processo sem console)."""
    if not IS_WINDOWS:
        return
    try:
        GWL_EXSTYLE     = -20
        WS_EX_APPWINDOW = 0x00040000
        WS_EX_TOOLWINDOW = 0x00000080
        SWP_FLAGS       = 0x0037  # NOMOVE | NOSIZE | NOZORDER | FRAMECHANGED
        hwnd = root.winfo_id()
        style = ctypes.windll.user32.GetWindowLongW(hwnd, GWL_EXSTYLE)
        style = (style & ~WS_EX_TOOLWINDOW) | WS_EX_APPWINDOW
        ctypes.windll.user32.SetWindowLongW(hwnd, GWL_EXSTYLE, style)
        # Notifica o Windows para reaplicar o estilo
        ctypes.windll.user32.SetWindowPos(
            hwnd, None, 0, 0, 0, 0, SWP_FLAGS
        )
    except Exception:
        pass


def main() -> None:
    _apply_dpi_awareness()   # antes do Tk()

    # AppUserModelID — agrupa o processo corretamente na taskbar e no Alt+Tab
    if IS_WINDOWS:
        try:
            ctypes.windll.shell32.SetCurrentProcessExplicitAppUserModelID(
                "ViniciusRodrigues.PhotoVault.Launcher.1"
            )
        except Exception:
            pass

    if not (ROOT / "package.json").exists():
        try:
            ctypes.windll.user32.MessageBoxW(
                0,
                f"package.json não encontrado em:\n{ROOT}\n\nColoque este .pyw na raiz do projeto.",
                "PhotoVault Launcher", 0x10,
            )
        except Exception:
            print("package.json não encontrado.", file=sys.stderr)
        sys.exit(1)

    root = tk.Tk()

    # Escala DPI — fontes e widgets no tamanho nativo do monitor
    if IS_WINDOWS:
        try:
            dpi = ctypes.windll.user32.GetDpiForWindow(root.winfo_id())
            if dpi and dpi != 96:
                root.tk.call("tk", "scaling", dpi / 72.0)
        except Exception:
            pass

    # Garante botão na barra de tarefas (após a janela existir)
    root.after(100, lambda: _force_taskbar(root))

    App(root)
    root.mainloop()


if __name__ == "__main__":
    main()
