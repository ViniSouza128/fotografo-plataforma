'use client'
// src/app/admin/eventos/[id]/page.js
import { useState, useEffect, useMemo, useCallback, useRef, Fragment } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useConfirmDialog } from "@/hooks/useConfirmDialog";
import { getPedidoItens, getPedidoItemPhotoId, getPhotoDuplicateKey } from "@/lib/commerceUtils";
import { applyNextImageFallback, getEventCoverCandidates, getFirstUrl, getPhotoCartPreviewCandidates, getPhotoModalDisplayCandidates } from "@/lib/imagePaths";
import { formatarCPF } from "@/lib/cpf";
import { formatarWhatsApp } from "@/lib/whatsapp";
import SafeDeleteModal from "@/components/SafeDeleteModal";
import CartPricePolicyModal from "@/components/CartPricePolicyModal";
import { getDefaultDerivativeConfig } from "@/lib/derivedImagesConfig";
import { simulateProgressiveTable, detectIncoherentTiers } from "@/lib/pricing";
import TabVideos from "@/components/admin/TabVideos";
import TabPatrocinadores from "@/components/admin/TabPatrocinadores";
import TabPrecosVideo from "@/components/admin/TabPrecosVideo";
// ===================== CATEGORIAS PREDEFINIDAS =====================
const CATEGORIAS = [
    "Futebol",
    "Crossfit",
    "Ciclismo",
    "Beach Tennis",
    "Futsal",
    "Corrida",
    "Nata\xe7\xe3o",
    "V\xf4lei",
    "Futev\xf4lei",
    "Basquete",
    "Artes Marciais",
    "Surf",
    "Motociclismo",
    "Jiu-j\xedtsu",
    "Padel",
    "Tenis",
    "Canoa Havaiana",
    "Mountain Bike",
    "Gin\xe1stica",
    "Hipismo",
    "Kite Surf",
    "Altinha",
    "Golfe",
    "Jud\xf4",
    "Motocross",
    "Paintball",
    "Skimboard",
    "T\xeanis de Mesa",
    "Skate",
    "Patina\xe7\xe3o",
    "Iatismo",
    "Dan\xe7a",
    "Futebol de Areia",
    "Escalada",
    "Voo Livre",
    "Mergulho",
    "Paraquedismo",
    "Trilhas",
    "Rodeio",
    "Treinos",
    "Esportes",
    "Subaqu\xe1tica",
    "Formaturas",
    "Teatro e Musicais",
    "Festas",
    "Casamento",
    "Anivers\xe1rio Infantil",
    "Shows/Concertos",
    "Festivais",
    "Religioso",
    "Pol\xedtico",
    "Feiras e Exposi\xe7\xf5es",
    "Eventos",
    "Encontro Automotivo",
    "Acampamento",
    "Pets",
    "Corporativo",
    "Drones",
    "Ecommerce",
    "Im\xf3veis",
    "Jornal\xedstica",
    "Moda",
    "Alimentos",
    "Ensaios",
    "Outro"
].sort();
const ESTADOS_BR = [
    "AC",
    "AL",
    "AP",
    "AM",
    "BA",
    "CE",
    "DF",
    "ES",
    "GO",
    "MA",
    "MT",
    "MS",
    "MG",
    "PA",
    "PB",
    "PR",
    "PE",
    "PI",
    "RJ",
    "RN",
    "RS",
    "RO",
    "RR",
    "SC",
    "SP",
    "SE",
    "TO"
];
const VISIB_OPTIONS_DETAIL = [
    { value: 'publico', label: 'P\u00FAblico', color: 'var(--success)' },
    { value: 'naolistado', label: 'N\u00E3o listado', color: 'var(--accent)' },
    { value: 'privado', label: 'Privado', color: 'var(--danger)' },
]
const TABS = [
    {
        id: "vendas",
        label: "Vendas & Contas",
        icon: "\uD83D\uDCB0"
    },
    {
        id: "carrinhos",
        label: "Carrinhos Ativos",
        icon: "\uD83D\uDED2"
    },
    {
        id: "fotos",
        label: "M\xeddia",
        icon: "\uD83C\uDF9E\uFE0F"
    },
    {
        id: "patrocinadores",
        label: "Patrocinadores",
        icon: "\uD83E\uDD1D"
    },
    {
        id: "watermark",
        label: "Marca d'Água",
        icon: "\uD83D\uDCA7"
    },
    {
        id: "relatorios",
        label: "Relat\xf3rios",
        icon: "\uD83D\uDCCA"
    },
    {
        id: "precos",
        label: "Pre\xe7os & Descontos",
        icon: "\uD83C\uDFF7️"
    },
    {
        id: "info",
        label: "Informa\xe7\xf5es",
        icon: "\uD83D\uDCDD"
    }
];
export default function EventoDetailPage(param) {
    let { params } = param;
    var _event_name;
    const { id } = params;
    const router = useRouter();
    const [event, setEvent] = useState(null);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState("vendas");
    const [saving, setSaving] = useState(false);
    const [toast, setToast] = useState("");
    const [showQr, setShowQr] = useState(false);
    const [editingVisibHeader, setEditingVisibHeader] = useState(false);
    const { confirm, confirmDialog } = useConfirmDialog();
    const [deletePrompt, setDeletePrompt] = useState(null);
    const [deleteBusy, setDeleteBusy] = useState(false);
    // Data
    const [pedidos, setPedidos] = useState([]);
    const [photos, setPhotos] = useState([]);
    const [clients, setClients] = useState([]);
    const [carrinhos, setCarrinhos] = useState([]);
    // Read initial tab from URL on mount
    useEffect(()=>{
        const params = new URLSearchParams(window.location.search);
        const tab = params.get("tab");
        if (tab && TABS.some((t)=>t.id === tab)) setActiveTab(tab);
    }, []);
    const loadEvent = useCallback(async ()=>{
        try {
            const res = await fetch("/api/events/".concat(id, "?stats=1"));
            if (!res.ok) throw new Error();
            const data = await res.json();
            setEvent(data);
        } catch (e) {
            setEvent(null);
        }
        setLoading(false);
    }, [
        id
    ]);
    useEffect(()=>{
        loadEvent();
    }, [
        loadEvent
    ]);
    useEffect(()=>{
        if (!event) return;
        Promise.all([
            fetch("/api/pedidos?admin=1").then((r)=>r.json()).catch(()=>[]),
            fetch("/api/photos?eventId=".concat(id)).then((r)=>r.json()).catch(()=>[]),
            fetch("/api/clients").then((r)=>r.json()).catch(()=>[]),
            fetch("/api/carrinhos").then((r)=>r.json()).catch(()=>[])
        ]).then((param)=>{
            let [ped, pho, cli, car] = param;
            setPedidos(Array.isArray(ped) ? ped : []);
            setPhotos(Array.isArray(pho) ? pho : []);
            setClients(Array.isArray(cli) ? cli : []);
            setCarrinhos(Array.isArray(car) ? car : []);
        });
    }, [
        event,
        id
    ]);
    function showToast(msg) {
        setToast(msg);
        setTimeout(()=>setToast(""), 3000);
    }
    async function solicitarExclusaoAlbum({ permanent = false } = {}) {
        const accepted = await confirm({
            title: "Excluir álbum",
            message: "Deseja excluir este álbum? Vamos verificar compras, carrinhos e favoritos antes de concluir.",
            confirmText: "Excluir",
            title: permanent ? "Excluir album definitivamente" : "Mover album para lixeira",
            message: permanent
                ? "A exclusao definitiva so sera permitida se nao houver compras, carrinhos, favoritos ou curtidas."
                : "Vamos verificar compras, carrinhos, favoritos e curtidas. Fotos vinculadas serao preservadas; as demais irao para a lixeira fisica.",
            confirmText: permanent ? "Excluir definitivo" : "Mover para lixeira",
            cancelText: "Cancelar",
            confirmTone: "danger"
        });
        if (!accepted) return;
        try {
            const res = await fetch("/api/events/".concat(id), {
                method: "DELETE",
                headers: permanent ? {
                    "Content-Type": "application/json"
                } : undefined,
                body: permanent ? JSON.stringify({
                    permanente: true
                }) : undefined
            });
            if (res.status === 409) {
                const data = await res.json();
                if (permanent) {
                    showToast(data.message || "Exclusao definitiva bloqueada por vinculos.");
                    return;
                }
                setDeletePrompt({
                    analysis: data.analysis,
                    eventId: id
                });
                return;
            }
            if (!res.ok) throw new Error();
            router.push("/admin/eventos");
        } catch (error) {
            console.error(error);
            showToast("Erro ao excluir álbum.");
        }
    }
    async function confirmarExclusaoAlbum(strategy, decisions = {}) {
        if (!deletePrompt) return;
        setDeleteBusy(true);
        try {
            const res = await fetch("/api/events/".concat(deletePrompt.eventId), {
                method: "DELETE",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    estrategia: strategy,
                    decisoes: decisions
                })
            });
            if (!res.ok) throw new Error();
            router.push("/admin/eventos");
        } catch (error) {
            console.error(error);
            showToast("Erro ao processar exclusão.");
        }
        setDeleteBusy(false);
    }
    async function saveEvent(updates) {
        setSaving(true);
        try {
            const res = await fetch("/api/events/".concat(id), {
                method: "PATCH",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify(updates)
            });
            if (!res.ok) throw new Error();
            const updated = await res.json();
            setEvent((prev)=>({
                    ...prev,
                    ...updated
                }));
            showToast("Salvo com sucesso!");
        } catch (e) {
            showToast("Erro ao salvar.");
        }
        setSaving(false);
    }
    function handleEventUpdate(updates) {
        setEvent((prev)=>({
                ...prev,
                ...updates
            }));
    }
    const eventPedidos = useMemo(()=>pedidos.filter((p)=>p.status === "pago" && getPedidoItens(p).some((i)=>i.eventId === id)), [
        pedidos,
        id
    ]);
    const eventCarrinhos = useMemo(()=>carrinhos.filter((c)=>(c.carrinho || []).some((i)=>i.eventId === id)), [
        carrinhos,
        id
    ]);
    if (loading) return  <div
      className={"flex-center"}
      style={{
            minHeight: "60vh"
        }}
    >
      { <div
        className={"spinner"}
        style={{
                width: "32px",
                height: "32px"
            }}
       />}
    </div>;
    if (!event) return  <div
      className={"empty-state"}
    >
      {[
             <div
              key="icon"
              className={"empty-state-icon"}
            >
              {"❌"}
            </div>,
             <h2
              key="title"
              className={"empty-state-title"}
            >
              {"Evento n\xe3o encontrado"}
            </h2>,
             <Link
              key="back"
              href={"/admin/eventos"}
              className={"btn btn-primary mt-3"}
            >
              {"Voltar"}
            </Link>
        ]}
    </div>;
    const stats = event._stats || {};
    return  <>
      {[
            toast &&  <div
              key="toast"
              style={{
                    position: "fixed",
                    top: "1rem",
                    right: "1rem",
                    zIndex: 9999,
                    background: toast.includes("Erro") ? "var(--danger)" : "var(--success)",
                    color: "#fff",
                    padding: "0.75rem 1.25rem",
                    borderRadius: "var(--radius)",
                    fontSize: "0.85rem",
                    fontWeight: 500,
                    boxShadow: "0 4px 12px rgba(0,0,0,0.3)"
                }}
            >
              {toast}
            </div>,
             <Fragment key="confirm-dialog">{confirmDialog}</Fragment>,
            deletePrompt &&  <SafeDeleteModal
              key="delete-modal"
              analysis={deletePrompt.analysis}
              scopeLabel={"álbum"}
              busy={deleteBusy}
              onCancel={()=>setDeletePrompt(null)}
              onConfirm={confirmarExclusaoAlbum}
            />,
             <div
              key="admin-header"
              className={"admin-header"}
              style={{
                    marginBottom: "0"
                }}
            >
              {[
                     <div key="left">
                      {[
                             <Link
                              key="breadcrumb"
                              href={"/admin/eventos"}
                              style={{
                                    color: "var(--text-muted)",
                                    fontSize: "0.8rem"
                                }}
                            >
                              {"← Eventos"}
                            </Link>,
                             <h1
                              key="title"
                              className={"admin-page-title"}
                              style={{
                                    marginTop: "0.25rem"
                                }}
                            >
                              {event.name}
                            </h1>,
                             <div
                              key="meta"
                              style={{
                                    display: "flex",
                                    gap: "0.75rem",
                                    alignItems: "center",
                                    marginTop: "0.25rem",
                                    flexWrap: "wrap"
                                }}
                            >
                              {[
                                    event.categoria &&  <span
                                      key="categoria"
                                      style={{
                                            fontSize: "0.75rem",
                                            color: "var(--text-muted)",
                                            background: "var(--bg-input)",
                                            padding: "0.15rem 0.5rem",
                                            borderRadius: "100px"
                                        }}
                                    >
                                      {event.categoria}
                                    </span>,
                                     <span
                                      key="date"
                                      style={{
                                            fontSize: "0.75rem",
                                            color: "var(--text-dim)"
                                        }}
                                    >
                                      {[
                                            new Date(event.date + "T12:00:00").toLocaleDateString("pt-BR"),
                                            event.dataFinal && event.dataFinal !== event.date && " — ".concat(new Date(event.dataFinal + "T12:00:00").toLocaleDateString("pt-BR"))
                                        ]}
                                    </span>,
                                    event.cidade &&  <span
                                      key="cidade"
                                      style={{
                                            fontSize: "0.75rem",
                                            color: "var(--text-dim)"
                                        }}
                                    >
                                      {[
                                            "\uD83D\uDCCD ",
                                            event.cidade,
                                            event.estado ? ", ".concat(event.estado) : ""
                                        ]}
                                    </span>,
                                    editingVisibHeader ?  <select
                                      key="visib"
                                      autoFocus
                                      defaultValue={event.visibilidade || "publico"}
                                      style={{ fontSize: "0.72rem", padding: "0.15rem 0.4rem", borderRadius: "100px", border: "1px solid var(--border)", background: "var(--bg-input)", color: "var(--text)", cursor: "pointer" }}
                                      onBlur={()=>setEditingVisibHeader(false)}
                                      onChange={(e)=>{
                                            const v = e.target.value;
                                            setEditingVisibHeader(false);
                                            saveEvent({ visibilidade: v });
                                        }}
                                    >
                                      {VISIB_OPTIONS_DETAIL.map((o)=> <option
                                        key={o.value}
                                        value={o.value}
                                      >
                                        {o.label}
                                      </option>)}
                                    </select> :  <span
                                      key="visib"
                                      onClick={()=>setEditingVisibHeader(true)}
                                      title={"Clique para alterar visibilidade"}
                                      style={{
                                            fontSize: "0.72rem",
                                            padding: "0.15rem 0.5rem",
                                            borderRadius: "100px",
                                            cursor: "pointer",
                                            fontWeight: 600,
                                            userSelect: "none",
                                            background: (VISIB_OPTIONS_DETAIL.find((o)=>o.value === (event.visibilidade || "publico"))?.color || "var(--success)") + "22",
                                            color: VISIB_OPTIONS_DETAIL.find((o)=>o.value === (event.visibilidade || "publico"))?.color || "var(--success)",
                                            border: "1px solid " + (VISIB_OPTIONS_DETAIL.find((o)=>o.value === (event.visibilidade || "publico"))?.color || "var(--success)") + "55"
                                        }}
                                    >
                                      {VISIB_OPTIONS_DETAIL.find((o)=>o.value === (event.visibilidade || "publico"))?.label || "P\u00FAblico"}
                                    </span>
                                ]}
                            </div>
                        ]}
                    </div>,
                     <div
                      key="actions"
                      style={{
                            display: "flex",
                            gap: "0.5rem",
                            flexWrap: "wrap",
                            alignItems: "center"
                        }}
                    >
                      {[
                             <button
                              key="copiar"
                              className={"btn btn-sm btn-ghost"}
                              title={"Copiar URL do evento"}
                              onClick={()=>{
                                    navigator.clipboard.writeText("".concat(window.location.origin, "/evento/").concat(id));
                                    showToast("URL copiada!");
                                }}
                            >
                              {"\uD83D\uDD17 Copiar URL"}
                            </button>,
                             <button
                              key="qr"
                              className={"btn btn-sm btn-ghost"}
                              title={"QR Code"}
                              onClick={()=>setShowQr((prev)=>!prev)}
                            >
                              {"\uD83D\uDCF1 QR Code"}
                            </button>,
                             <Link
                              key="ver-site"
                              href={"/evento/".concat(id)}
                              target={"_blank"}
                              className={"btn btn-sm btn-ghost"}
                            >
                              {"\uD83C\uDF10 Ver no site"}
                            </Link>,
                             <button
                              key="excluir"
                              className={"btn btn-sm btn-danger"}
                              onClick={()=>solicitarExclusaoAlbum()}
                            >
                              {"\uD83D\uDDD1 Excluir álbum"}
                            </button>,
                             <button
                              key="excluir-def"
                              className={"btn btn-sm btn-danger"}
                              title={"Excluir definitivamente se seguro"}
                              onClick={()=>solicitarExclusaoAlbum({ permanent: true })}
                            >
                              {"X Definitivo"}
                            </button>
                        ]}
                    </div>
                ]}
            </div>,
            showQr && "object" !== "undefined" &&  <div
              key="qr-modal"
              style={{
                    margin: "1rem 0",
                    padding: "1.5rem",
                    background: "var(--bg-card)",
                    border: "1px solid var(--border)",
                    borderRadius: "var(--radius-lg)",
                    display: "flex",
                    alignItems: "flex-start",
                    gap: "1.5rem",
                    flexWrap: "wrap"
                }}
            >
              {[
                     <img
                      src={"https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=".concat(encodeURIComponent(window.location.origin + "/evento/" + id), "&bgcolor=0c0c0c&color=ffffff&margin=2")}
                      alt={"QR Code do evento"}
                      style={{
                            width: "160px",
                            height: "160px",
                            borderRadius: "8px",
                            flexShrink: 0
                        }}
                     />,
                     <div>
                      {[
                             <p
                              style={{
                                    fontWeight: 600,
                                    marginBottom: "0.25rem"
                                }}
                            >
                              {"QR Code do Evento"}
                            </p>,
                             <p
                              style={{
                                    fontSize: "0.78rem",
                                    color: "var(--text-dim)",
                                    marginBottom: "0.75rem",
                                    wordBreak: "break-all"
                                }}
                            >
                              {[
                                    window.location.origin,
                                    "/evento/",
                                    id
                                ]}
                            </p>,
                             <div
                              style={{
                                    display: "flex",
                                    gap: "0.5rem",
                                    flexWrap: "wrap"
                                }}
                            >
                              {[
                                     <a
                                      href={"https://api.qrserver.com/v1/create-qr-code/?size=600x600&data=".concat(encodeURIComponent(window.location.origin + "/evento/" + id), "&bgcolor=0c0c0c&color=ffffff&margin=4")}
                                      download={"qrcode-".concat((_event_name = event.name) === null || _event_name === void 0 ? void 0 : _event_name.replace(/\s+/g, "-"), ".png")}
                                      target={"_blank"}
                                      rel={"noreferrer"}
                                      className={"btn btn-sm btn-primary"}
                                    >
                                      {"⬇ Baixar QR (600px)"}
                                    </a>,
                                     <button
                                      className={"btn btn-sm btn-ghost"}
                                      onClick={()=>setShowQr(false)}
                                    >
                                      {"Fechar"}
                                    </button>
                                ]}
                            </div>
                        ]}
                    </div>
                ]}
            </div>,
             <div
              key="stats"
              style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
                    gap: "1rem",
                    margin: "1.5rem 0"
                }}
            >
              {[
                     <StatCard
                      key="visitas"
                      label={"Visitas"}
                      value={event.visitas || 0}
                     />,
                     <StatCard
                      key="totalFotos"
                      label={"Total Fotos"}
                      value={stats.totalFotos || 0}
                     />,
                     <StatCard
                      key="fotosVendidas"
                      label={"Fotos Vendidas"}
                      value={stats.fotosVendidas || 0}
                     />,
                     <StatCard
                      key="vendas"
                      label={"Vendas"}
                      value={stats.totalVendas || 0}
                     />,
                     <StatCard
                      key="faturamento"
                      label={"Faturamento"}
                      value={"R$ ".concat((stats.faturamento || 0).toFixed(2).replace(".", ","))}
                      color={"var(--success)"}
                     />,
                     <StatCard
                      key="ticketMedio"
                      label={"Ticket M\xe9dio"}
                      value={"R$ ".concat((stats.ticketMedio || 0).toFixed(2).replace(".", ","))}
                     />
                ]}
            </div>,
             <div
              key="tabs-bar"
              style={{
                    display: "flex",
                    gap: "0",
                    borderBottom: "1px solid var(--border)",
                    marginBottom: "1.5rem",
                    overflowX: "auto"
                }}
            >
              {TABS.map((tab)=> <button
                key={tab.id}
                onClick={()=>setActiveTab(tab.id)}
                style={{
                            padding: "0.75rem 1.25rem",
                            background: "none",
                            border: "none",
                            cursor: "pointer",
                            color: activeTab === tab.id ? "var(--accent)" : "var(--text-muted)",
                            borderBottom: activeTab === tab.id ? "2px solid var(--accent)" : "2px solid transparent",
                            fontSize: "0.82rem",
                            fontWeight: activeTab === tab.id ? 600 : 400,
                            whiteSpace: "nowrap",
                            transition: "all 0.15s"
                        }}
              >
                {[
                            tab.icon,
                            " ",
                            tab.label
                        ]}
              </button>)}
            </div>,
            activeTab === "vendas" &&  <TabVendas
              key="tab-vendas"
              eventId={id}
              pedidos={eventPedidos}
              clients={clients}
              photos={photos}
             />,
            activeTab === "carrinhos" &&  <TabCarrinhos
              key="tab-carrinhos"
              eventId={id}
              carrinhos={eventCarrinhos}
              confirm={confirm}
             />,
            activeTab === "fotos" &&  <TabFotos
              key="tab-fotos"
              eventId={id}
              photos={photos}
              event={event}
              onEventUpdate={handleEventUpdate}
              confirm={confirm}
             />,
            activeTab === "patrocinadores" &&  <TabPatrocinadores
              key="tab-patrocinadores"
              eventId={id}
              embedded={true}
             />,
            activeTab === "watermark" &&  <TabWatermark
              key="tab-watermark"
              event={event}
              onChange={handleEventUpdate}
              onSave={saveEvent}
            />,
            activeTab === "relatorios" &&  <TabRelatorios
              key="tab-relatorios"
              eventId={id}
              photos={photos}
              pedidos={eventPedidos}
             />,
            activeTab === "precos" &&  <TabPrecos
              key="tab-precos"
              event={event}
              saveEvent={saveEvent}
              saving={saving}
              confirm={confirm}
              showToast={showToast}
             />,
            activeTab === "info" &&  <TabInfo
              key="tab-info"
              event={event}
              saveEvent={saveEvent}
              saving={saving}
              confirm={confirm}
              showToast={showToast}
             />
        ]}
    </>;
}
// ===================== COMPONENTS =====================
function StatCard(param) {
    let { label, value, color } = param;
    return  <div
      className={"stat-card"}
    >
      {[
             <p
              key="label"
              style={{
                    fontSize: "0.68rem",
                    color: "var(--text-dim)",
                    textTransform: "uppercase",
                    letterSpacing: "0.05em"
                }}
            >
              {label}
            </p>,
             <p
              key="value"
              style={{
                    fontSize: "1.4rem",
                    fontWeight: 700,
                    color: color || "var(--text)",
                    marginTop: "0.25rem"
                }}
            >
              {value}
            </p>
        ]}
    </div>;
}
// ── Helpers para construir URLs de miniaturas ────────────────────────────────
// Fotos do banco usam preferencialmente os caminhos canônicos pathThumbWm /
// pathMiniClean; os campos filenameThumb/filenameMini seguem apenas como legado.
// ─────────────────────────────────────────────────────────────────────────────
// ===================== TAB: VENDAS & CONTAS =====================
function TabVendas(param) {
    let { eventId, pedidos, clients, photos } = param;
    const [subTab, setSubTab] = useState("compras");
    const [selectedPedido, setSelectedPedido] = useState(null);
    const clientMap = useMemo(()=>{
        const m = {};
        clients.forEach((c)=>{
            m[c.id] = c;
        });
        return m;
    }, [
        clients
    ]);
    const eventClients = useMemo(()=>{
        const map = {};
        pedidos.forEach((p)=>{
            const key = p.clientId || p.whatsapp || p.email || "anon";
            if (!map[key]) {
                map[key] = {
                    nome: p.clienteNome || p.nome || "An\xf4nimo",
                    whatsapp: p.whatsapp || "",
                    email: p.email || "",
                    clientId: p.clientId,
                    totalCompras: 0,
                    totalGasto: 0,
                    totalFotos: 0
                };
            }
            const itensEvento = getPedidoItens(p).filter((i)=>i.eventId === eventId);
            map[key].totalCompras++;
            map[key].totalFotos += itensEvento.length;
            map[key].totalGasto += itensEvento.reduce((s, i)=>s + (Number(i.price) || 0), 0);
        });
        return Object.values(map).sort((a, b)=>b.totalGasto - a.totalGasto);
    }, [
        pedidos,
        eventId
    ]);
    const soldPhotos = useMemo(()=>{
        const map = {};
        pedidos.forEach((p)=>{
            getPedidoItens(p).filter((i)=>i.eventId === eventId).forEach((item)=>{
                const photoId = getPedidoItemPhotoId(item);
                if (!photoId) return;
                if (!map[photoId]) map[photoId] = {
                    ...item,
                    id: photoId,
                    vezesVendida: 0,
                    totalArrecadado: 0
                };
                map[photoId].vezesVendida++;
                map[photoId].totalArrecadado += Number(item.price) || 0;
            });
        });
        return Object.values(map).sort((a, b)=>b.vezesVendida - a.vezesVendida);
    }, [
        pedidos,
        eventId
    ]);
    return  <>
      {[
             <div
              key="subtabs"
              style={{
                    display: "flex",
                    gap: "0.5rem",
                    marginBottom: "1.5rem"
                }}
            >
              {[
                    {
                        id: "compras",
                        label: "Compras (".concat(pedidos.length, ")")
                    },
                    {
                        id: "midias",
                        label: "M\xeddias vendidas (".concat(soldPhotos.length, ")")
                    },
                    {
                        id: "clientes",
                        label: "Contas (".concat(eventClients.length, ")")
                    }
                ].map((st)=> <button
                  key={st.id}
                  className={"btn btn-sm ".concat(subTab === st.id ? "btn-primary" : "btn-ghost")}
                  onClick={()=>setSubTab(st.id)}
                >
                  {st.label}
                </button>)}
            </div>,
            subTab === "compras" &&  <Fragment key="compras">
              {[
                    pedidos.length === 0 ?  <p
                      key="empty"
                      style={{
                            color: "var(--text-dim)",
                            fontSize: "0.88rem"
                        }}
                    >
                      {"Nenhuma venda registrada neste evento."}
                    </p> :  <div
                      key="empty"
                      style={{
                            overflowX: "auto"
                        }}
                    >
                      { <table
                        style={{
                                width: "100%",
                                borderCollapse: "collapse"
                            }}
                      >
                        {[
                                 <thead key="thead">
                                  { <tr
                                    style={{
                                            borderBottom: "1px solid var(--border)"
                                        }}
                                  >
                                    {[
                                             <th key="id"
                                              style={thS}
                                            >
                                              {"ID"}
                                            </th>,
                                             <th key="data"
                                              style={thS}
                                            >
                                              {"Data"}
                                            </th>,
                                             <th key="cliente"
                                              style={thS}
                                            >
                                              {"Cliente"}
                                            </th>,
                                             <th key="qtd"
                                              style={{
                                                    ...thS,
                                                    textAlign: "right"
                                                }}
                                            >
                                              {"Qtd"}
                                            </th>,
                                             <th key="valor"
                                              style={{
                                                    ...thS,
                                                    textAlign: "right"
                                                }}
                                            >
                                              {"Valor"}
                                            </th>,
                                             <th key="acoes"
                                              style={{
                                                    ...thS,
                                                    textAlign: "center"
                                                }}
                                            >
                                              {"A\xe7\xf5es"}
                                            </th>
                                        ]}
                                  </tr>}
                                </thead>,
                                 <tbody key="tbody">
                                  {pedidos.map((p)=>{
                                        var _p_id;
                                        const itensEvento = getPedidoItens(p).filter((i)=>i.eventId === eventId);
                                        const valorEvento = itensEvento.reduce((s, i)=>s + (Number(i.price) || 0), 0);
                                        return  <tr
                                          key={p.id}
                                          style={{
                                                borderBottom: "1px solid var(--border-subtle, rgba(255,255,255,0.05))"
                                            }}
                                        >
                                          {[
                                                 <td key="id"
                                                  style={tdS}
                                                >
                                                  { <span
                                                    style={{
                                                            fontFamily: "monospace",
                                                            fontSize: "0.78rem"
                                                        }}
                                                  >
                                                    {((_p_id = p.id) === null || _p_id === void 0 ? void 0 : _p_id.slice(0, 10)) || "—"}
                                                  </span>}
                                                </td>,
                                                 <td key="data"
                                                  style={tdS}
                                                >
                                                  {p.criadoEm ? new Date(p.criadoEm).toLocaleDateString("pt-BR") : "—"}
                                                </td>,
                                                 <td key="cliente"
                                                  style={tdS}
                                                >
                                                  {p.clienteNome || p.nome || "An\xf4nimo"}
                                                </td>,
                                                 <td key="qtd"
                                                  style={{
                                                        ...tdS,
                                                        textAlign: "right"
                                                    }}
                                                >
                                                  {itensEvento.length}
                                                </td>,
                                                 <td key="valor"
                                                  style={{
                                                        ...tdS,
                                                        textAlign: "right",
                                                        color: "var(--success)"
                                                    }}
                                                >
                                                  {[
                                                        "R$ ",
                                                        valorEvento.toFixed(2).replace(".", ",")
                                                    ]}
                                                </td>,
                                                 <td key="acoes"
                                                  style={{
                                                        ...tdS,
                                                        textAlign: "center"
                                                    }}
                                                >
                                                  { <button
                                                    className={"btn btn-ghost btn-sm"}
                                                    onClick={()=>setSelectedPedido(p)}
                                                  >
                                                    {"\uD83D\uDC41 Ver"}
                                                  </button>}
                                                </td>
                                            ]}
                                        </tr>;
                                    })}
                                </tbody>
                            ]}
                      </table>}
                    </div>,
                    selectedPedido &&  <SaleDetailModal
                      key="modal"
                      pedido={selectedPedido}
                      eventId={eventId}
                      onClose={()=>setSelectedPedido(null)}
                     />
                ]}
            </Fragment>,
            subTab === "midias" &&  <Fragment key="midias">
              {soldPhotos.length === 0 ?  <p
                style={{
                        color: "var(--text-dim)",
                        fontSize: "0.88rem"
                    }}
              >
                {"Nenhuma m\xeddia vendida neste evento."}
              </p> :  <div
                style={{
                        display: "grid",
                        gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))",
                        gap: "0.75rem"
                    }}
              >
                {soldPhotos.map((photo)=>{
                        var _photo_id;
                        const thumbCandidates = getPhotoCartPreviewCandidates(photo);
                        const src = getFirstUrl(thumbCandidates);
                        return  <div
                          key={photo.id || photo.photoId}
                          style={{
                                background: "var(--bg-card)",
                                border: "1px solid var(--border)",
                                borderRadius: "var(--radius)",
                                overflow: "hidden"
                            }}
                        >
                          {[
                                 <div
                                  style={{
                                        height: "100px",
                                        background: "var(--bg-input)"
                                    }}
                                >
                                  { <img
                                    src={src}
                                    alt={""}
                                    loading={"lazy"}
                                    style={{
                                            width: "100%",
                                            height: "100%",
                                            objectFit: "cover"
                                        }}
                                    onError={(e)=>{
                                            if (!applyNextImageFallback(e.target, thumbCandidates)) e.target.style.display = "none";
                                        }}
                                   />}
                                </div>,
                                 <div
                                  style={{
                                        padding: "0.5rem"
                                    }}
                                >
                                  {[
                                         <p
                                          style={{
                                                fontSize: "0.72rem",
                                                color: "var(--text-dim)",
                                                fontFamily: "monospace"
                                            }}
                                        >
                                          {[
                                                "#",
                                                photo.publicId || ((_photo_id = photo.id) === null || _photo_id === void 0 ? void 0 : _photo_id.slice(0, 8))
                                            ]}
                                        </p>,
                                         <p
                                          style={{
                                                fontSize: "0.78rem",
                                                color: "var(--text)"
                                            }}
                                        >
                                          {[
                                                photo.vezesVendida,
                                                "x vendida"
                                            ]}
                                        </p>,
                                         <p
                                          style={{
                                                fontSize: "0.72rem",
                                                color: "var(--success)"
                                            }}
                                        >
                                          {[
                                                "R$ ",
                                                photo.totalArrecadado.toFixed(2).replace(".", ",")
                                            ]}
                                        </p>
                                    ]}
                                </div>
                            ]}
                        </div>;
                    })}
              </div>}
            </Fragment>,
            subTab === "clientes" &&  <Fragment key="clientes">
              {eventClients.length === 0 ?  <p
                style={{
                        color: "var(--text-dim)",
                        fontSize: "0.88rem"
                    }}
              >
                {"Nenhum cliente comprou neste evento."}
              </p> :  <div
                style={{
                        overflowX: "auto"
                    }}
              >
                { <table
                  style={{
                            width: "100%",
                            borderCollapse: "collapse"
                        }}
                >
                  {[
                             <thead key="thead">
                              { <tr
                                style={{
                                        borderBottom: "1px solid var(--border)"
                                    }}
                              >
                                {[
                                         <th
                                          style={thS}
                                        >
                                          {"Cliente"}
                                        </th>,
                                         <th
                                          style={thS}
                                        >
                                          {"Contato"}
                                        </th>,
                                         <th
                                          style={{
                                                ...thS,
                                                textAlign: "right"
                                            }}
                                        >
                                          {"Compras"}
                                        </th>,
                                         <th
                                          style={{
                                                ...thS,
                                                textAlign: "right"
                                            }}
                                        >
                                          {"Fotos"}
                                        </th>,
                                         <th
                                          style={{
                                                ...thS,
                                                textAlign: "right"
                                            }}
                                        >
                                          {"Total Gasto"}
                                        </th>
                                    ]}
                              </tr>}
                            </thead>,
                             <tbody key="tbody">
                              {eventClients.map((c, i)=> <tr
                                key={c.clientId || c.email || i}
                                style={{
                                            borderBottom: "1px solid var(--border-subtle, rgba(255,255,255,0.05))"
                                        }}
                              >
                                {[
                                             <td
                                              style={tdS}
                                            >
                                              {[
                                                     <span
                                                      style={{
                                                            fontWeight: 500
                                                        }}
                                                    >
                                                      {c.nome}
                                                    </span>,
                                                    c.clientId &&  <span
                                                      style={{
                                                            fontSize: "0.68rem",
                                                            color: "var(--accent)",
                                                            marginLeft: "0.5rem"
                                                        }}
                                                    >
                                                      {"Cadastrado"}
                                                    </span>
                                                ]}
                                            </td>,
                                             <td
                                              style={tdS}
                                            >
                                              { <span
                                                style={{
                                                        fontSize: "0.78rem",
                                                        color: "var(--text-dim)"
                                                    }}
                                              >
                                                {formatarWhatsApp(c.whatsapp) || c.whatsapp || c.email || "—"}
                                              </span>}
                                            </td>,
                                             <td
                                              style={{
                                                    ...tdS,
                                                    textAlign: "right"
                                                }}
                                            >
                                              {c.totalCompras}
                                            </td>,
                                             <td
                                              style={{
                                                    ...tdS,
                                                    textAlign: "right"
                                                }}
                                            >
                                              {c.totalFotos}
                                            </td>,
                                             <td
                                              style={{
                                                    ...tdS,
                                                    textAlign: "right",
                                                    color: "var(--success)"
                                                }}
                                            >
                                              {[
                                                    "R$ ",
                                                    c.totalGasto.toFixed(2).replace(".", ",")
                                                ]}
                                            </td>
                                        ]}
                              </tr>)}
                            </tbody>
                        ]}
                </table>}
              </div>}
            </Fragment>
        ]}
    </>;
}
// ===================== SALE DETAIL MODAL =====================
function SaleDetailModal(param) {
    let { pedido, eventId, onClose } = param;
    const itensEvento = getPedidoItens(pedido).filter((i)=>i.eventId === eventId);
    const valorEvento = itensEvento.reduce((s, i)=>s + (Number(i.price) || 0), 0);
    return  <div
      style={{
            position: "fixed",
            inset: 0,
            zIndex: 9999,
            background: "rgba(0,0,0,0.8)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "1rem"
        }}
      onClick={onClose}
    >
      { <div
        style={{
                background: "var(--bg-card)",
                borderRadius: "var(--radius-lg)",
                border: "1px solid var(--border)",
                maxWidth: "700px",
                width: "100%",
                maxHeight: "85vh",
                overflow: "auto",
                padding: "2rem"
            }}
        onClick={(e)=>e.stopPropagation()}
      >
        {[
                 <div
                  style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        marginBottom: "1.5rem"
                    }}
                >
                  {[
                         <h2
                          style={{
                                fontFamily: "var(--font-heading)",
                                fontSize: "1.1rem"
                            }}
                        >
                          {"Detalhes da Venda"}
                        </h2>,
                         <button
                          onClick={onClose}
                          className={"btn btn-ghost btn-sm"}
                        >
                          {"✕"}
                        </button>
                    ]}
                </div>,
                 <div
                  style={{
                        display: "grid",
                        gridTemplateColumns: "1fr 1fr",
                        gap: "1rem",
                        marginBottom: "1.5rem"
                    }}
                >
                  {[
                        [
                            "ID da Venda",
                             <span
                              style={{
                                    fontFamily: "monospace",
                                    fontSize: "0.82rem"
                                }}
                            >
                              {pedido.id || "—"}
                            </span>
                        ],
                        [
                            "Data/Hora",
                            pedido.criadoEm ? new Date(pedido.criadoEm).toLocaleString("pt-BR") : "—"
                        ],
                        [
                            "Cliente",
                            pedido.clienteNome || pedido.nome || "An\xf4nimo"
                        ],
                        [
                            "WhatsApp",
                            formatarWhatsApp(pedido.whatsapp) || pedido.whatsapp || "—"
                        ],
                        [
                            "E-mail",
                            pedido.email || "—"
                        ],
                        [
                            "CPF",
                            formatarCPF(pedido.cpf) || pedido.cpf || "—"
                        ],
                        [
                            "Forma de Pagamento",
                            pedido.formaPagamento || pedido.pagamento || "Simulado"
                        ],
                        [
                            "Valor Total",
                             <span
                              style={{
                                    fontSize: "0.82rem",
                                    color: "var(--success)",
                                    fontWeight: 600
                                }}
                            >
                              {[
                                    "R$ ",
                                    (Number(pedido.total) || 0).toFixed(2).replace(".", ",")
                                ]}
                            </span>
                        ]
                    ].map((param)=>{
                        let [label, val] = param;
                        return  <div>
                          {[
                                 <p
                                  style={{
                                        fontSize: "0.72rem",
                                        color: "var(--text-dim)"
                                    }}
                                >
                                  {label}
                                </p>,
                                 <p
                                  style={{
                                        fontSize: "0.82rem"
                                    }}
                                >
                                  {val}
                                </p>
                            ]}
                        </div>;
                    })}
                </div>,
                 <h3
                  style={{
                        fontSize: "0.85rem",
                        color: "var(--text-muted)",
                        marginBottom: "0.75rem"
                    }}
                >
                  {[
                        "Itens deste evento (",
                        itensEvento.length,
                        ")"
                    ]}
                </h3>,
                 <div
                  style={{
                        display: "grid",
                        gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))",
                        gap: "0.5rem"
                    }}
                >
                  {itensEvento.map((item)=>{
                        var _getPedidoItemPhotoId_slice, _getPedidoItemPhotoId;
                        const thumbCandidates = getPhotoCartPreviewCandidates(item);
                        const src = getFirstUrl(thumbCandidates);
                        return  <div
                          style={{
                                background: "var(--bg-input)",
                                borderRadius: "var(--radius)",
                                overflow: "hidden"
                            }}
                        >
                          {[
                                 <div
                                  style={{
                                        height: "80px"
                                    }}
                                >
                                  { <img
                                    src={src}
                                    alt={""}
                                    loading={"lazy"}
                                    style={{
                                            width: "100%",
                                            height: "100%",
                                            objectFit: "cover"
                                        }}
                                    onError={(e)=>{
                                            if (!applyNextImageFallback(e.target, thumbCandidates)) e.target.style.display = "none";
                                        }}
                                   />}
                                </div>,
                                 <div
                                  style={{
                                        padding: "0.4rem"
                                    }}
                                >
                                  {[
                                         <p
                                          style={{
                                                fontSize: "0.68rem",
                                                color: "var(--text-dim)",
                                                fontFamily: "monospace"
                                            }}
                                        >
                                          {[
                                                "#",
                                                item.publicId || ((_getPedidoItemPhotoId = getPedidoItemPhotoId(item)) === null || _getPedidoItemPhotoId === void 0 ? void 0 : (_getPedidoItemPhotoId_slice = _getPedidoItemPhotoId.slice) === null || _getPedidoItemPhotoId_slice === void 0 ? void 0 : _getPedidoItemPhotoId_slice.call(_getPedidoItemPhotoId, 0, 8))
                                            ]}
                                        </p>,
                                         <p
                                          style={{
                                                fontSize: "0.75rem",
                                                color: "var(--success)"
                                            }}
                                        >
                                          {[
                                                "R$ ",
                                                (Number(item.price) || 0).toFixed(2).replace(".", ",")
                                            ]}
                                        </p>
                                    ]}
                                </div>
                            ]}
                        </div>;
                    })}
                </div>,
                 <div
                  style={{
                        marginTop: "1.5rem",
                        paddingTop: "1rem",
                        borderTop: "1px solid var(--border)",
                        textAlign: "right"
                    }}
                >
                  {[
                         <span
                          style={{
                                fontSize: "0.85rem",
                                color: "var(--text-muted)"
                            }}
                        >
                          {"Valor neste evento: "}
                        </span>,
                         <span
                          style={{
                                fontSize: "1.1rem",
                                fontWeight: 700,
                                color: "var(--success)"
                            }}
                        >
                          {[
                                "R$ ",
                                valorEvento.toFixed(2).replace(".", ",")
                            ]}
                        </span>
                    ]}
                </div>
            ]}
      </div>}
    </div>;
}
// ===================== TAB: CARRINHOS ATIVOS =====================
function TabCarrinhos(param) {
    let { eventId, carrinhos: carrinhosProp, confirm } = param;
    const [carrinhos, setCarrinhos] = useState(carrinhosProp);
    const [liberando, setLiberando] = useState(null);
    useEffect(()=>{
        setCarrinhos(carrinhosProp);
    }, [
        carrinhosProp
    ]);
    async function liberarCarrinho(clienteId, nomeCliente) {
        const accepted = await confirm({
            title: "Esvaziar carrinho",
            message: 'Esvaziar o carrinho de "'.concat(nomeCliente, '"?\nO cliente perderá todos os itens salvos.'),
            confirmText: "Esvaziar",
            cancelText: "Cancelar",
            confirmTone: "danger"
        });
        if (!accepted) return;
        setLiberando(clienteId);
        try {
            const res = await fetch("/api/carrinhos?clientId=".concat(clienteId), {
                method: "DELETE"
            });
            if (res.ok) setCarrinhos((prev)=>prev.filter((c)=>c.id !== clienteId));
            else alert("Erro ao liberar carrinho.");
        } catch (e) {
            alert("Erro ao liberar carrinho.");
        }
        setLiberando(null);
    }
    if (carrinhos.length === 0) return  <p
      style={{
            color: "var(--text-dim)",
            fontSize: "0.88rem"
        }}
    >
      {"Nenhum carrinho ativo cont\xe9m fotos deste evento."}
    </p>;
    return  <div
      style={{
            overflowX: "auto"
        }}
    >
      {[
             <p
              style={{
                    fontSize: "0.82rem",
                    color: "var(--text-muted)",
                    marginBottom: "1rem"
                }}
            >
              {[
                    carrinhos.length,
                    " carrinho",
                    carrinhos.length !== 1 ? "s" : "",
                    " com fotos deste evento"
                ]}
            </p>,
             <table
              style={{
                    width: "100%",
                    borderCollapse: "collapse"
                }}
            >
              {[
                     <thead key="thead">
                      { <tr
                        style={{
                                borderBottom: "1px solid var(--border)"
                            }}
                      >
                        {[
                                 <th
                                  style={thS}
                                >
                                  {"Cliente"}
                                </th>,
                                 <th
                                  style={{
                                        ...thS,
                                        textAlign: "right"
                                    }}
                                >
                                  {"Itens do Evento"}
                                </th>,
                                 <th
                                  style={{
                                        ...thS,
                                        textAlign: "right"
                                    }}
                                >
                                  {"Total Carrinho"}
                                </th>,
                                 <th
                                  style={{
                                        ...thS,
                                        textAlign: "right"
                                    }}
                                >
                                  {"Valor"}
                                </th>,
                                 <th
                                  style={thS}
                                >
                                  {"Atualizado"}
                                </th>,
                                 <th
                                  style={{
                                        ...thS,
                                        textAlign: "center"
                                    }}
                                >
                                  {"A\xe7\xe3o"}
                                </th>
                            ]}
                      </tr>}
                    </thead>,
                     <tbody key="tbody">
                      {carrinhos.map((c)=>{
                            const itensEvento = (c.carrinho || []).filter((item)=>item.eventId === eventId);
                            const valor = itensEvento.reduce((s, item)=>s + (Number(item.price) || 0), 0);
                            const totalCarrinho = (c.carrinho || []).length;
                            const nome = c.nomeCompleto || c.clienteNome || c.nome || "An\xf4nimo";
                            return  <tr
                              style={{
                                    borderBottom: "1px solid var(--border-subtle, rgba(255,255,255,0.05))"
                                }}
                            >
                              {[
                                     <td
                                      style={tdS}
                                    >
                                      {[
                                             <span
                                              style={{
                                                    fontWeight: 500
                                                }}
                                            >
                                              {nome}
                                            </span>,
                                            c.whatsapp &&  <span
                                              style={{
                                                    fontSize: "0.72rem",
                                                    color: "var(--text-dim)",
                                                    marginLeft: "0.5rem"
                                                }}
                                            >
                                              {formatarWhatsApp(c.whatsapp) || c.whatsapp}
                                            </span>,
                                            c.email &&  <span
                                              style={{
                                                    fontSize: "0.72rem",
                                                    color: "var(--text-dim)",
                                                    display: "block"
                                                }}
                                            >
                                              {c.email}
                                            </span>
                                        ]}
                                    </td>,
                                     <td
                                      style={{
                                            ...tdS,
                                            textAlign: "right"
                                        }}
                                    >
                                      {itensEvento.length}
                                    </td>,
                                     <td
                                      style={{
                                            ...tdS,
                                            textAlign: "right",
                                            color: "var(--text-dim)"
                                        }}
                                    >
                                      {[
                                            totalCarrinho,
                                            " item",
                                            totalCarrinho !== 1 ? "s" : ""
                                        ]}
                                    </td>,
                                     <td
                                      style={{
                                            ...tdS,
                                            textAlign: "right",
                                            color: "var(--success)"
                                        }}
                                    >
                                      {[
                                            "R$ ",
                                            valor.toFixed(2).replace(".", ",")
                                        ]}
                                    </td>,
                                     <td
                                      style={tdS}
                                    >
                                      { <span
                                        style={{
                                                fontSize: "0.78rem",
                                                color: "var(--text-dim)"
                                            }}
                                      >
                                        {c.atualizadoEm ? new Date(c.atualizadoEm).toLocaleString("pt-BR") : "—"}
                                      </span>}
                                    </td>,
                                     <td
                                      style={{
                                            ...tdS,
                                            textAlign: "center"
                                        }}
                                    >
                                      { <button
                                        className={"btn btn-sm"}
                                        style={{
                                                color: "var(--danger)",
                                                border: "1px solid var(--danger)",
                                                background: "transparent",
                                                cursor: "pointer"
                                            }}
                                        disabled={liberando === c.id}
                                        onClick={()=>liberarCarrinho(c.id, nome)}
                                      >
                                        {liberando === c.id ? "..." : "\uD83D\uDDD1 Liberar"}
                                      </button>}
                                    </td>
                                ]}
                            </tr>;
                        })}
                    </tbody>
                ]}
            </table>
        ]}
    </div>;
}
// ===================== TAB: FOTOS (file explorer + integrated upload) =====================
function TabFotos(param) {
    let { eventId, photos: photosProp, event, onEventUpdate, confirm } = param;
    const [photos, setPhotos] = useState(photosProp);
    const [currentFolder, setCurrentFolder] = useState(null);
    const [page, setPage] = useState(1);
    const PER_PAGE = 200;
    // Selection
    const [selected, setSelected] = useState(new Set());
    // Bulk modals
    const [showMoveModal, setShowMoveModal] = useState(false);
    const [showPriceModal, setShowPriceModal] = useState(false);
    const [showRenameModal, setShowRenameModal] = useState(false);
    const [novaDestino, setNovaDestino] = useState("");
    const [novoPreco, setNovoPreco] = useState("");
    const [renameOld, setRenameOld] = useState("");
    const [renameNew, setRenameNew] = useState("");
    const [busy, setBusy] = useState(false);
    const [toast, setToast] = useState("");
    const [coverUpdating, setCoverUpdating] = useState(null);
    const [adminPhotoModalId, setAdminPhotoModalId] = useState(null);
    const [deletePrompt, setDeletePrompt] = useState(null);
    const [deleteBusy, setDeleteBusy] = useState(false);
    const [pricePolicyPrompt, setPricePolicyPrompt] = useState(null);
    const [pricePolicyBusy, setPricePolicyBusy] = useState(false);
    const pendingPricePatchRef = useRef(null);
    var _event_wm_capa;
    // Configurações de marca d'água por álbum
    const [wmCapa, setWmCapa] = useState((_event_wm_capa = event === null || event === void 0 ? void 0 : event.wm_capa) !== null && _event_wm_capa !== void 0 ? _event_wm_capa : false);
    var _event_wm_miniaturas;
    const [wmMin, setWmMin] = useState((_event_wm_miniaturas = event === null || event === void 0 ? void 0 : event.wm_miniaturas) !== null && _event_wm_miniaturas !== void 0 ? _event_wm_miniaturas : true);
    const [regenStatus, setRegenStatus] = useState(null) // null | 'loading' | 'ok' | 'erro'
    ;
    const [extraFolders, setExtraFolders] = useState([]);
    const [showCreateFoldersModal, setShowCreateFoldersModal] = useState(false);
    const [newFoldersText, setNewFoldersText] = useState("");
    const [coverChoicePhoto, setCoverChoicePhoto] = useState(null);
    // Search and folder selection (P21)
    const [searchText, setSearchText] = useState("");
    const [debouncedSearch, setDebouncedSearch] = useState("");
    const [selectedFolders, setSelectedFolders] = useState(new Set());
    const [lastSelectedId, setLastSelectedId] = useState(null);
    const [moveTreeTarget, setMoveTreeTarget] = useState("");
    const [moveTreeNewName, setMoveTreeNewName] = useState("");
    const [moveTreeError, setMoveTreeError] = useState("");
    // Upload
    const [fila, setFila] = useState([]);
    const [dragging, setDragging] = useState(false);
    const [enviando, setEnviando] = useState(false);
    const [precoUpload, setPrecoUpload] = useState(29.90);
    const fileInputRef = useRef(null);
    useEffect(()=>{
        setPhotos(photosProp);
    }, [
        photosProp
    ]);
    // ESC key closes modals
    useEffect(()=>{
        function handleKeyDown(e) {
            if (e.key === "Escape") {
                if (adminPhotoModalId) setAdminPhotoModalId(null);
                else if (showCreateFoldersModal) setShowCreateFoldersModal(false);
            }
        }
        window.addEventListener("keydown", handleKeyDown);
        return ()=>window.removeEventListener("keydown", handleKeyDown);
    }, [
        adminPhotoModalId,
        showCreateFoldersModal
    ]);
    // Load default price
    useEffect(()=>{
        const albumPriceRaw = event?.precoFotoPadrao;
        const albumPrice = Number(albumPriceRaw);
        if (albumPriceRaw !== null && albumPriceRaw !== undefined && albumPriceRaw !== "" && Number.isFinite(albumPrice)) {
            setPrecoUpload(albumPrice);
            return;
        }
        fetch("/api/config").then((r)=>r.json()).then((cfg)=>{
            const configPrice = Number(cfg?.precoFotoDefault);
            if (Number.isFinite(configPrice)) setPrecoUpload(configPrice);
        }).catch(()=>{});
    }, [
        event?.precoFotoPadrao
    ]);
    // Debounce search text (P21)
    useEffect(()=>{
        const t = setTimeout(()=>setDebouncedSearch(searchText.trim()), 300);
        return ()=>clearTimeout(t);
    }, [
        searchText
    ]);
    function showMsg(msg) {
        setToast(msg);
        setTimeout(()=>setToast(""), 3000);
    }
    const requestDeletePhotos = useCallback(async ({ ids, pasta = null, permanent = false })=>{
        if (!ids || ids.length === 0) return;
        const accepted = await confirm({
            title: ids.length === 1 ? "Excluir foto" : `Excluir ${ids.length} fotos`,
            message: "Analisaremos compras, carrinhos e favoritos antes de excluir. Deseja continuar?",
            confirmText: "Continuar",
            title: permanent ? (ids.length === 1 ? "Excluir foto definitivamente" : `Excluir ${ids.length} fotos definitivamente`) : (ids.length === 1 ? "Mover foto para lixeira" : `Mover ${ids.length} fotos para lixeira`),
            message: permanent
                ? "A exclusao definitiva so sera permitida se nao houver compras, carrinhos, favoritos ou curtidas."
                : "Vamos verificar compras, carrinhos, favoritos e curtidas. Fotos vinculadas serao preservadas; as demais irao para a lixeira fisica.",
            confirmText: permanent ? "Excluir definitivo" : "Mover para lixeira",
            cancelText: "Cancelar",
            confirmTone: "danger"
        });
        if (!accepted) return;
        try {
            const res = await fetch("/api/photos", {
                method: "DELETE",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    ids,
                    eventId,
                    pasta,
                    permanente: permanent
                })
            });
            if (res.status === 409) {
                const data = await res.json();
                if (permanent) {
                    showMsg(data.message || "Exclusao definitiva bloqueada por vinculos.");
                    return;
                }
                setDeletePrompt({
                    analysis: data.analysis,
                    context: {
                        ids,
                        pasta
                    }
                });
                return;
            }
            if (!res.ok) throw new Error();
            setPhotos((prev)=>prev.filter((p)=>!ids.includes(p.id)));
            setSelected(new Set());
            showMsg(permanent ? "Fotos excluidas definitivamente." : "Fotos movidas para lixeira.");
        } catch (error) {
            console.error(error);
            showMsg("Erro ao remover fotos.");
        }
    }, [
        confirm,
        eventId
    ]);
    const handleDeleteDecision = useCallback(async (strategy, decisions = {})=>{
        if (!deletePrompt) return;
        setDeleteBusy(true);
        try {
            const res = await fetch("/api/photos", {
                method: "DELETE",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    ids: deletePrompt.context.ids,
                    eventId,
                    pasta: deletePrompt.context.pasta,
                    estrategia: strategy,
                    decisoes: decisions
                })
            });
            if (!res.ok) throw new Error();
            setPhotos((prev)=>prev.filter((p)=>!deletePrompt.context.ids.includes(p.id)));
            setSelected(new Set());
            setDeletePrompt(null);
        } catch (error) {
            console.error(error);
            showMsg("Erro ao processar exclusão.");
        }
        setDeleteBusy(false);
    }, [
        deletePrompt,
        eventId
    ]);
    const folders = useMemo(()=>{
        const set = new Set([
            ...photos.filter((p)=>!p.removida).map((p)=>p.pasta).filter(Boolean),
            ...extraFolders
        ]);
        // Expand intermediate paths (P21 subfolders via "/")
        const expanded = new Set();
        set.forEach((folder)=>{
            const parts = String(folder).split("/").filter(Boolean);
            for(let i = 1; i <= parts.length; i++){
                expanded.add(parts.slice(0, i).join("/"));
            }
        });
        return [
            ...expanded
        ].sort();
    }, [
        photos,
        extraFolders
    ]);
    const activePhotos = useMemo(()=>photos.filter((p)=>!p.removida && !p.orfaoFuncional && !p.ocultarDoAlbum), [
        photos
    ]);
    // Direct subfolders of current location (P21)
    const subfolders = useMemo(()=>{
        if (currentFolder === null) {
            return folders.filter((f)=>!f.includes("/"));
        }
        const prefix = currentFolder + "/";
        return folders.filter((f)=>f.startsWith(prefix) && !f.slice(prefix.length).includes("/"));
    }, [
        folders,
        currentFolder
    ]);
    // Items to show in current view (root = no-folder photos; folder = folder's photos)
    const displayItems = useMemo(()=>{
        if (currentFolder !== null) return activePhotos.filter((p)=>p.pasta === currentFolder);
        return activePhotos.filter((p)=>!p.pasta);
    }, [
        activePhotos,
        currentFolder
    ]);
    // Album-wide search results (P21)
    const searchResults = useMemo(()=>{
        if (!debouncedSearch) return null;
        const q = debouncedSearch.toLowerCase();
        return activePhotos.filter((p)=>String(p.publicId || "").toLowerCase().includes(q) || String(p.originalName || "").toLowerCase().includes(q) || String(p.filename || "").toLowerCase().includes(q));
    }, [
        debouncedSearch,
        activePhotos
    ]);
    const totalPages = Math.ceil(displayItems.length / PER_PAGE);
    const pageItems = displayItems.slice((page - 1) * PER_PAGE, page * PER_PAGE);
    // Selection helpers
    function toggleSelect(id) {
        setSelected((prev)=>{
            const n = new Set(prev);
            n.has(id) ? n.delete(id) : n.add(id);
            return n;
        });
    }
    function selectAll() {
        const pageIds = pageItems.map((p)=>p.id);
        const allSelected = pageIds.every((id)=>selected.has(id));
        if (allSelected) setSelected((prev)=>{
            const n = new Set(prev);
            pageIds.forEach((id)=>n.delete(id));
            return n;
        });
        else setSelected((prev)=>{
            const n = new Set(prev);
            pageIds.forEach((id)=>n.add(id));
            return n;
        });
    }
    const allPageSelected = pageItems.length > 0 && pageItems.every((p)=>selected.has(p.id));
    const allItemsSelected = displayItems.length > 0 && displayItems.every((p)=>selected.has(p.id));
    const selectedArr = [
        ...selected
    ];
    // Effective IDs for bulk: directly selected photos + photos in selected folders (recursive) (P21)
    const effectiveSelectedIds = useMemo(()=>{
        const ids = new Set(selected);
        if (selectedFolders.size > 0) {
            selectedFolders.forEach((folderPath)=>{
                activePhotos.forEach((p)=>{
                    const pasta = p.pasta || "";
                    if (pasta === folderPath || pasta.startsWith(folderPath + "/")) ids.add(p.id);
                });
            });
        }
        return [
            ...ids
        ];
    }, [
        selected,
        selectedFolders,
        activePhotos
    ]);
    function toggleSelectFolder(path) {
        setSelectedFolders((prev)=>{
            const n = new Set(prev);
            n.has(path) ? n.delete(path) : n.add(path);
            return n;
        });
    }
    function selectAllItems() {
        setSelected(new Set(displayItems.map((p)=>p.id)));
    }
    function handlePhotoSelectClick(e, id) {
        if (e.shiftKey && lastSelectedId !== null) {
            e.preventDefault();
            const ids = (searchResults ?? pageItems).map((p)=>p.id);
            const startIdx = ids.indexOf(lastSelectedId);
            const endIdx = ids.indexOf(id);
            if (startIdx >= 0 && endIdx >= 0) {
                const [a, b] = startIdx <= endIdx ? [
                    startIdx,
                    endIdx
                ] : [
                    endIdx,
                    startIdx
                ];
                setSelected((prev)=>{
                    const n = new Set(prev);
                    for(let i = a; i <= b; i++)n.add(ids[i]);
                    return n;
                });
            }
            return;
        }
        toggleSelect(id);
        setLastSelectedId(id);
    }
    function applyLocalBulkPatch(payload, affectedIds = effectiveSelectedIds) {
        const affectedSet = new Set(affectedIds);
        setPhotos((prev)=>prev.map((p)=>{
                if (!affectedSet.has(p.id)) return p;
                const u = {
                    ...p
                };
                if (payload.pasta !== undefined) u.pasta = payload.pasta || null;
                if (payload.price !== undefined) u.price = Number(payload.price);
                if (payload.gratis !== undefined) u.gratis = payload.gratis;
                if (payload.removida !== undefined) {
                    u.removida = payload.removida;
                    u.removidaEm = payload.removida ? new Date().toISOString() : null;
                }
                return u;
            }));
    }
    // Bulk patch
    async function bulkPatch(payload) {
        setBusy(true);
        try {
            const idsToPatch = effectiveSelectedIds;
            const res = await fetch("/api/photos", {
                method: "PATCH",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    ids: idsToPatch,
                    ...payload
                })
            });
            if (res.status === 409 && payload.price !== undefined) {
                const data = await res.json();
                pendingPricePatchRef.current = {
                    ids: idsToPatch,
                    payload
                };
                setPricePolicyPrompt(data.analysis);
                return false;
            }
            if (!res.ok) throw new Error();
            applyLocalBulkPatch(payload, idsToPatch);
            setSelected(new Set());
            setSelectedFolders(new Set());
            showMsg("✓ ".concat(idsToPatch.length, " foto").concat(idsToPatch.length !== 1 ? "s" : "", " atualizadas"));
            return true;
        } catch (e) {
            showMsg("Erro ao atualizar fotos");
            return false;
        } finally{
            setBusy(false);
        }
    }
    async function resolvePricePolicy(decision) {
        const pending = pendingPricePatchRef.current;
        if (!pending) return;
        setPricePolicyBusy(true);
        try {
            const res = await fetch("/api/photos", {
                method: "PATCH",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    ids: pending.ids,
                    ...pending.payload,
                    cartPriceDecision: decision
                })
            });
            if (!res.ok) throw new Error();
            applyLocalBulkPatch(pending.payload, pending.ids);
            setSelected(new Set());
            setShowPriceModal(false);
            setNovoPreco("");
            pendingPricePatchRef.current = null;
            setPricePolicyPrompt(null);
            showMsg("✓ Preços atualizados com política aplicada aos carrinhos");
        } catch (e) {
            showMsg("Erro ao aplicar política de preço");
        } finally{
            setPricePolicyBusy(false);
        }
    }
    // Set as cover + gera coverImageFile (480px sem WM por padrão)
    async function setCover(photo, forceTarget) {
        if (photo.pasta && !forceTarget) {
            setCoverChoicePhoto(photo);
            return;
        }
        if (forceTarget === "pasta" && photo.pasta) {
            try {
                const pastasCapas = {
                    ...(event?.pastasCapas || {}),
                    [photo.pasta]: photo.filename
                };
                const r = await fetch("/api/events/".concat(eventId), {
                    method: "PATCH",
                    headers: {
                        "Content-Type": "application/json"
                    },
                    body: JSON.stringify({ pastasCapas })
                });
                if (!r.ok) throw new Error();
                if (onEventUpdate) onEventUpdate({ pastasCapas });
                showMsg("✓ Capa da pasta definida!");
            } catch (e) {
                showMsg("Erro ao definir capa da pasta");
            }
            return;
        }
        setCoverUpdating(photo.id);
        try {
            const coverImageThumb = photo.filenameThumb || "thumb_".concat(photo.filename);
            const patchRes = await fetch("/api/events/".concat(eventId), {
                method: "PATCH",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    coverImage: photo.filename,
                    coverImageThumb
                })
            });
            if (!patchRes.ok) throw new Error();
            if (onEventUpdate) onEventUpdate({
                coverImage: photo.filename,
                coverImageThumb
            });
            // Gera cover_xxx.jpg (480px) respeitando wm_capa do evento
            const regenRes = await fetch("/api/events/".concat(eventId, "/regenerate"), {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    type: "cover"
                })
            });
            if (regenRes.ok) {
                const { cover } = await regenRes.json();
                if (cover && onEventUpdate) onEventUpdate({
                    coverImageFile: cover
                });
            }
            showMsg("✓ Capa do \xe1lbum definida e gerada!");
        } catch (e) {
            showMsg("Erro ao definir capa");
        }
        setCoverUpdating(null);
    }
    // Toggle free
    async function handleToggleFree(photo) {
        const newVal = !photo.gratis;
        try {
            await fetch("/api/photos", {
                method: "PATCH",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    id: photo.id,
                    gratis: newVal
                })
            });
            setPhotos((prev)=>prev.map((p)=>p.id === photo.id ? {
                        ...p,
                        gratis: newVal
                    } : p));
        } catch (e) {
            showMsg("Erro ao alterar foto gr\xe1tis");
        }
    }
    // Bulk action handlers
    async function handleMoveToFolder() {
        await bulkPatch({
            pasta: novaDestino.trim() || null
        });
        setShowMoveModal(false);
        setNovaDestino("");
    }
    // Move via tree picker (P21). Handles folders + photos with no-self-move guard.
    async function handleMoveViaTree() {
        setMoveTreeError("");
        const targetRaw = (moveTreeTarget || "").trim();
        const newName = (moveTreeNewName || "").trim();
        // Compose final target path = target + (optional newName)
        const finalTarget = newName ? (targetRaw ? targetRaw + "/" + newName : newName) : targetRaw;
        // Validate against moving folders into themselves or descendants
        for (const fp of selectedFolders){
            if (finalTarget === fp || finalTarget.startsWith(fp + "/")) {
                setMoveTreeError('Não é possível mover "'.concat(fp, '" para dentro de si mesma.'));
                return;
            }
        }
        // Validate duplicates: if creating new folder name, ensure no clash at target level
        if (newName) {
            if (folders.includes(finalTarget)) {
                setMoveTreeError('Já existe uma pasta "'.concat(finalTarget, '".'));
                return;
            }
        }
        setBusy(true);
        try {
            // 1) Move folders (rename pasta paths). For each selected folder, move it (and subfolders) under finalTarget.
            for (const fp of selectedFolders){
                const leaf = fp.split("/").pop();
                const folderNewBase = finalTarget ? finalTarget + "/" + leaf : leaf;
                const directIds = photos.filter((p)=>p.pasta === fp && !p.removida).map((p)=>p.id);
                if (directIds.length > 0) {
                    await fetch("/api/photos", {
                        method: "PATCH",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ ids: directIds, pasta: folderNewBase })
                    });
                }
                const prefix = fp + "/";
                const sub = photos.filter((p)=>!p.removida && (p.pasta || "").startsWith(prefix));
                for (const p of sub){
                    const rest = p.pasta.slice(prefix.length);
                    const newPasta = folderNewBase + "/" + rest;
                    await fetch("/api/photos", {
                        method: "PATCH",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ ids: [p.id], pasta: newPasta })
                    });
                }
                // local update
                setPhotos((prev)=>prev.map((p)=>{
                        if (p.pasta === fp) return { ...p, pasta: folderNewBase };
                        if ((p.pasta || "").startsWith(prefix)) return { ...p, pasta: folderNewBase + "/" + p.pasta.slice(prefix.length) };
                        return p;
                    }));
                setExtraFolders((prev)=>prev.map((x)=>x === fp ? folderNewBase : (x.startsWith(prefix) ? folderNewBase + "/" + x.slice(prefix.length) : x)));
            }
            // 2) Move directly selected photos to finalTarget
            if (selected.size > 0) {
                const ids = [
                    ...selected
                ];
                const res = await fetch("/api/photos", {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ ids, pasta: finalTarget || null })
                });
                if (res.ok) {
                    const idSet = new Set(ids);
                    setPhotos((prev)=>prev.map((p)=>idSet.has(p.id) ? { ...p, pasta: finalTarget || null } : p));
                }
            }
            // 3) If finalTarget is brand-new (not yet a folder) and no photos moved into it, register it
            if (finalTarget && !folders.includes(finalTarget) && selected.size === 0 && selectedFolders.size === 0) {
                setExtraFolders((prev)=>prev.includes(finalTarget) ? prev : [...prev, finalTarget]);
            }
            setSelected(new Set());
            setSelectedFolders(new Set());
            setShowMoveModal(false);
            setMoveTreeTarget("");
            setMoveTreeNewName("");
            showMsg(finalTarget ? '✓ Movido para "'.concat(finalTarget, '"') : "✓ Movido para a raiz");
        } catch (e) {
            showMsg("Erro ao mover");
        } finally{
            setBusy(false);
        }
    }
    async function handleBulkPrice() {
        const precoNorm = String(novoPreco).replace(",", ".");
        if (!precoNorm || isNaN(Number(precoNorm))) {
            showMsg("Pre\xe7o inv\xe1lido");
            return;
        }
        const ok = await bulkPatch({
            price: Number(precoNorm)
        });
        if (ok) {
            setShowPriceModal(false);
            setNovoPreco("");
        }
    }
    async function handleRenameFolder() {
        if (!renameNew.trim()) return;
        setBusy(true);
        try {
            const ids = photos.filter((p)=>p.pasta === renameOld).map((p)=>p.id);
            if (ids.length > 0) {
                await fetch("/api/photos", {
                    method: "PATCH",
                    headers: {
                        "Content-Type": "application/json"
                    },
                    body: JSON.stringify({
                        ids,
                        pasta: renameNew.trim()
                    })
                });
                setPhotos((prev)=>prev.map((p)=>p.pasta === renameOld ? {
                            ...p,
                            pasta: renameNew.trim()
                        } : p));
            }
            showMsg('Pasta renomeada para "'.concat(renameNew.trim(), '"'));
            if (currentFolder === renameOld) setCurrentFolder(renameNew.trim());
        } catch (e) {
            showMsg("Erro ao renomear pasta");
        }
        setBusy(false);
        setShowRenameModal(false);
        setRenameNew("");
    }
    // Upload logic
    function processFiles(files) {
        const allowedImage = [
            "image/jpeg",
            "image/jpg",
            "image/png",
            "image/webp"
        ];
        const isVideoFile = (f) => {
            const t = String(f?.type || "").toLowerCase();
            if (t.startsWith("video/")) return true;
            const n = String(f?.name || "").toLowerCase();
            return /\.(mp4|m4v|mov|webm)$/.test(n);
        };
        const isImageFile = (f) => {
            if (allowedImage.includes(f?.type)) return true;
            const n = String(f?.name || "").toLowerCase();
            return /\.(jpe?g|png|webp)$/.test(n);
        };
        const novos = [];
        const existingKeys = new Set(photos.filter((p)=>!p.removida).map((photo)=>getPhotoDuplicateKey(photo)).filter(Boolean));
        const queueKeys = new Set(fila.map((item)=>{
            var _item_file, _item_file1;
            return getPhotoDuplicateKey({
                name: (_item_file = item.file) === null || _item_file === void 0 ? void 0 : _item_file.name,
                size: (_item_file1 = item.file) === null || _item_file1 === void 0 ? void 0 : _item_file1.size
            });
        }).filter(Boolean));
        let ignoredExisting = 0;
        let ignoredQueue = 0;
        let ignoredFormat = 0;
        Array.from(files).forEach((file)=>{
            const video = isVideoFile(file);
            const image = !video && isImageFile(file);
            if (!image && !video) { ignoredFormat++; return; }
            const duplicateKey = getPhotoDuplicateKey({
                name: file.name,
                size: file.size
            });
            if (duplicateKey && existingKeys.has(duplicateKey)) {
                ignoredExisting++;
                return;
            }
            if (duplicateKey && queueKeys.has(duplicateKey)) {
                ignoredQueue++;
                return;
            }
            if (duplicateKey) queueKeys.add(duplicateKey);
            novos.push({
                id: Math.random().toString(36).slice(2),
                file,
                mediaType: video ? "video" : "photo",
                preview: image ? URL.createObjectURL(file) : null,
                price: video ? (Number(event?.precoVideoPadrao) || precoUpload) : precoUpload,
                status: "pendente",
                error: ""
            });
        });
        if (ignoredFormat > 0) {
            showMsg("".concat(ignoredFormat, " arquivo").concat(ignoredFormat !== 1 ? "s" : "", " ignorado").concat(ignoredFormat !== 1 ? "s" : "", ": formato n\xe3o suportado (use JPG, PNG, WebP, MP4, MOV ou WebM)."));
        }
        const ignoredTotal = ignoredExisting + ignoredQueue;
        if (ignoredTotal > 0) {
            const reasons = [];
            if (ignoredExisting > 0) reasons.push("".concat(ignoredExisting, " j\xe1 existiam no evento"));
            if (ignoredQueue > 0) reasons.push("".concat(ignoredQueue, " j\xe1 estavam na fila"));
            showMsg("".concat(ignoredTotal, " arquivo").concat(ignoredTotal !== 1 ? "s" : "", " ignorado").concat(ignoredTotal !== 1 ? "s" : "", ": mesmo nome original e mesmo tamanho (").concat(reasons.join(" \xb7 "), ")."));
        }
        setFila((prev)=>[
                ...prev,
                ...novos
            ]);
    }
    function handleFileInput(e) {
        processFiles(e.target.files);
        e.target.value = "";
    }
    function handleDrop(e) {
        e.preventDefault();
        setDragging(false);
        processFiles(e.dataTransfer.files);
    }
    function uploadFileXHR(file, onProgress, options) {
        const url = (options && options.url) || "/api/upload";
        const extra = (options && options.extra) || null;
        const posterBlob = (options && options.posterBlob) || null;
        return new Promise((resolve, reject)=>{
            const xhr = new XMLHttpRequest();
            const fd = new FormData();
            fd.append("file", file);
            if (eventId) fd.append("eventId", eventId);
            if (extra && typeof extra === "object") {
                for (const k of Object.keys(extra)) {
                    if (extra[k] !== undefined && extra[k] !== null) fd.append(k, String(extra[k]));
                }
            }
            if (posterBlob) {
                try { fd.append("poster", posterBlob, "poster.jpg"); } catch {}
            }
            xhr.upload.addEventListener("progress", (e)=>{
                if (e.lengthComputable) onProgress({
                    loaded: e.loaded,
                    total: e.total
                });
            });
            xhr.addEventListener("load", ()=>{
                if (xhr.status >= 200 && xhr.status < 300) {
                    try {
                        resolve(JSON.parse(xhr.responseText));
                    } catch (e) {
                        reject(new Error("Resposta inv\xe1lida"));
                    }
                } else {
                    let body = {};
                    try {
                        body = JSON.parse(xhr.responseText || "{}");
                    } catch {}
                    reject(new Error(body.error || "Falha no upload (".concat(xhr.status, ")")));
                }
            });
            xhr.addEventListener("error", ()=>reject(new Error("Erro de rede")));
            xhr.open("POST", url);
            xhr.send(fd);
        });
    }
    async function captureVideoMeta(file) {
        return new Promise((resolve)=>{
            try {
                const url = URL.createObjectURL(file);
                const v = document.createElement("video");
                v.preload = "metadata";
                v.muted = true;
                v.playsInline = true;
                v.src = url;
                let settled = false;
                const finish = (data)=>{
                    if (settled) return;
                    settled = true;
                    try { URL.revokeObjectURL(url); } catch {}
                    resolve(data || { width: null, height: null, duration: null, posterBlob: null });
                };
                v.onloadedmetadata = ()=>{
                    const dur = Number(v.duration) || 0;
                    const target = dur > 2 ? 1 : Math.max(0, dur / 2);
                    try { v.currentTime = target; } catch { finish({ width: v.videoWidth || null, height: v.videoHeight || null, duration: dur || null, posterBlob: null }); }
                };
                v.onseeked = async ()=>{
                    try {
                        const w = v.videoWidth || 640;
                        const h = v.videoHeight || 360;
                        const canvas = document.createElement("canvas");
                        canvas.width = w; canvas.height = h;
                        const ctx = canvas.getContext("2d");
                        ctx.drawImage(v, 0, 0, w, h);
                        const blob = await new Promise((r)=>canvas.toBlob(r, "image/jpeg", 0.85));
                        finish({ width: w, height: h, duration: Number(v.duration) || null, posterBlob: blob || null });
                    } catch {
                        finish({ width: v.videoWidth || null, height: v.videoHeight || null, duration: Number(v.duration) || null, posterBlob: null });
                    }
                };
                v.onerror = ()=> finish({ width: null, height: null, duration: null, posterBlob: null });
                setTimeout(()=> finish({ width: v.videoWidth || null, height: v.videoHeight || null, duration: Number(v.duration) || null, posterBlob: null }), 12000);
            } catch {
                resolve({ width: null, height: null, duration: null, posterBlob: null });
            }
        });
    }
    async function enviarFotos() {
        const pendentes = fila.filter((item)=>item.status === "pendente");
        if (pendentes.length === 0) return;
        setEnviando(true);
        const CONCURRENCY = 3;
        const queue = [
            ...pendentes
        ];
        const collectedTakenAt = [];
        async function worker() {
            while(queue.length > 0){
                const item = queue.shift();
                if (!item) continue;
                const startTime = Date.now();
                setFila((prev)=>prev.map((f)=>f.id === item.id ? {
                            ...f,
                            status: "enviando",
                            progress: 0,
                            speed: 0,
                            eta: null
                        } : f));
                try {
                    if (item.mediaType === "video") {
                        // ─── Vídeo: extrai metadata + poster, sobe via /api/upload-video, registra em /api/videos ───
                        const meta = await captureVideoMeta(item.file);
                        const upVideo = await uploadFileXHR(item.file, (param)=>{
                            let { loaded, total } = param;
                            const elapsed = (Date.now() - startTime) / 1000;
                            const speed = elapsed > 0.1 ? loaded / elapsed : 0;
                            const eta = speed > 0 ? (total - loaded) / speed : null;
                            const progress = Math.round(loaded / total * 100);
                            setFila((prev)=>prev.map((f)=>f.id === item.id ? {
                                        ...f,
                                        progress,
                                        speed,
                                        eta
                                    } : f));
                        }, { url: "/api/upload-video", extra: { role: "original" }, posterBlob: meta.posterBlob });
                        if (!upVideo || !upVideo.ok) throw new Error((upVideo && upVideo.error) || "Falha no upload de vídeo");
                        const videoRes = await fetch("/api/videos", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({
                                eventId,
                                filename: upVideo.filename,
                                originalName: upVideo.originalName || item.file.name,
                                originalPath: upVideo.originalPath,
                                size: upVideo.size,
                                width: meta.width,
                                height: meta.height,
                                duration: meta.duration,
                                takenAt: item.file.lastModified ? new Date(item.file.lastModified).toISOString() : null,
                                posterClean: upVideo.posterClean || null,
                                price: Number(item.price) || null,
                                pasta: currentFolder || null,
                                previewWmFilename: upVideo.previewWmFilename || null,
                                previewWmStatus: upVideo.previewWmStatus || (upVideo.previewWmFilename ? "ready" : "pending"),
                            }),
                        });
                        if (!videoRes.ok) {
                            const errBody = await videoRes.json().catch(()=>({}));
                            throw new Error(errBody.error || "Falha ao registrar vídeo");
                        }
                        setFila((prev)=>prev.map((f)=>f.id === item.id ? { ...f, status: "ok", progress: 100 } : f));
                        continue;
                    }
                    const uploadData = await uploadFileXHR(item.file, (param)=>{
                        let { loaded, total } = param;
                        const elapsed = (Date.now() - startTime) / 1000;
                        const speed = elapsed > 0.1 ? loaded / elapsed : 0;
                        const eta = speed > 0 ? (total - loaded) / speed : null;
                        const progress = Math.round(loaded / total * 100);
                        setFila((prev)=>prev.map((f)=>f.id === item.id ? {
                                    ...f,
                                    progress,
                                    speed,
                                    eta
                                } : f));
                    });
                    const { filename, filenameWm, filenameThumb, filenameMini, originalName, size, takenAt, author } = uploadData;
                    if (takenAt) collectedTakenAt.push(takenAt);
                    const photoRes = await fetch("/api/photos", {
                        method: "POST",
                        headers: {
                            "Content-Type": "application/json"
                        },
                        body: JSON.stringify({
                            eventId,
                            filename,
                            filenameWm,
                            filenameThumb,
                            filenameMini,
                            price: Number(item.price),
                            originalName,
                            size,
                            takenAt,
                            author,
                            pasta: currentFolder || null
                        })
                    });
                    if (!photoRes.ok) throw new Error("Falha ao salvar");
                    const savedPhoto = await photoRes.json();
                    if (savedPhoto === null || savedPhoto === void 0 ? void 0 : savedPhoto.skipped) {
                        setFila((prev)=>prev.map((f)=>f.id === item.id ? {
                                    ...f,
                                    status: "ignorado",
                                    progress: 100,
                                    error: "Arquivo j\xe1 existe neste evento"
                                } : f));
                        showMsg("Alguns uploads foram ignorados porque j\xe1 existe foto com o mesmo nome original e o mesmo tamanho neste evento.");
                        continue;
                    }
                    setFila((prev)=>prev.map((f)=>f.id === item.id ? {
                                ...f,
                                status: "ok",
                                progress: 100
                            } : f));
                    setPhotos((prev)=>[
                            ...prev,
                            savedPhoto
                        ]);
                } catch (err) {
                    setFila((prev)=>prev.map((f)=>f.id === item.id ? {
                                ...f,
                                status: "erro",
                                error: err.message
                            } : f));
                }
            }
        }
        await Promise.all(Array.from({
            length: CONCURRENCY
        }, ()=>worker()));
        const needsInicio = !event?.horarioInicial;
        const needsFinal = !event?.horarioFinal;
        if ((needsInicio || needsFinal) && collectedTakenAt.length > 0) {
            const allTakenAt = [
                ...photos.filter((p)=>p.takenAt).map((p)=>p.takenAt),
                ...collectedTakenAt
            ].sort();
            const toHHMM = (iso)=>{
                const d = new Date(iso);
                return String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0");
            };
            const autoUpdates = {};
            if (needsInicio) autoUpdates.horarioInicial = toHHMM(allTakenAt[0]);
            if (needsFinal) autoUpdates.horarioFinal = toHHMM(allTakenAt[allTakenAt.length - 1]);
            try {
                const res = await fetch("/api/events/".concat(eventId), {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(autoUpdates)
                });
                if (res.ok) onEventUpdate(autoUpdates);
            } catch {}
        }
        setEnviando(false);
    }
    const pendentesCount = fila.filter((f)=>f.status === "pendente").length;
    const okCount = fila.filter((f)=>f.status === "ok").length;
    const erroCount = fila.filter((f)=>f.status === "erro").length;
    const ignoredCount = fila.filter((f)=>f.status === "ignorado").length;
    return  <>
      {[
            toast &&  <div
              style={{
                    position: "fixed",
                    top: "4.5rem",
                    right: "1rem",
                    zIndex: 9999,
                    background: toast.startsWith("Erro") ? "var(--danger)" : "var(--success)",
                    color: "#fff",
                    padding: "0.6rem 1rem",
                    borderRadius: "var(--radius)",
                    fontSize: "0.82rem",
                    fontWeight: 500
                }}
            >
              {toast}
            </div>,
            deletePrompt &&  <SafeDeleteModal
              analysis={deletePrompt.analysis}
              scopeLabel={deletePrompt.context && deletePrompt.context.ids && deletePrompt.context.ids.length === 1 ? "foto" : "fotos"}
              busy={deleteBusy}
              onCancel={()=>setDeletePrompt(null)}
              onConfirm={handleDeleteDecision}
            />,
            pricePolicyPrompt &&  <CartPricePolicyModal
              analysis={pricePolicyPrompt}
              busy={pricePolicyBusy}
              onCancel={()=>{
                    pendingPricePatchRef.current = null;
                    setPricePolicyPrompt(null);
                }}
              onConfirm={resolvePricePolicy}
            />,
            // ─── Vídeos do álbum (integrados na aba Mídia, sem wrapper colapsável) ──
            <div key="videos-section" style={{ marginBottom: '1.5rem' }}>
              <h3 style={{ fontFamily: 'var(--font-heading)', fontSize: '1.05rem', margin: '0 0 0.6rem' }}>
                🎬 Vídeos do álbum
              </h3>
              <TabVideos eventId={eventId} embedded={true} />
            </div>,
             <div
              style={{
                    border: "2px dashed ".concat(dragging ? "var(--accent)" : "var(--border)"),
                    borderRadius: "var(--radius-lg)",
                    background: dragging ? "rgba(var(--accent-rgb, 201,169,110), 0.06)" : "var(--bg-card)",
                    marginBottom: "1.25rem",
                    transition: "border-color 0.15s, background 0.15s"
                }}
              onDragOver={(e)=>{
                    e.preventDefault();
                    setDragging(true);
                }}
              onDragLeave={()=>setDragging(false)}
              onDrop={handleDrop}
            >
              {[
                     <div
                      style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "0.75rem",
                            padding: "0.85rem 1rem"
                        }}
                    >
                      {[
                             <span
                              style={{
                                    fontSize: "1.2rem"
                                }}
                            >
                              {"\uD83D\uDCE4"}
                            </span>,
                             <div
                              style={{
                                    flex: 1
                                }}
                            >
                              {[
                                     <p
                                      style={{
                                            fontSize: "0.85rem",
                                            fontWeight: 500
                                        }}
                                    >
                                      {dragging ? "Solte os arquivos aqui" : "Arraste fotos ou vídeos aqui ou clique para selecionar"}
                                    </p>,
                                     <p
                                      style={{
                                            fontSize: "0.72rem",
                                            color: "var(--text-dim)"
                                        }}
                                    >
                                      {[
                                            "JPG, PNG, WebP, MP4, MOV, WebM",
                                            currentFolder ? " \xb7 upload vai para: \uD83D\uDCC2 ".concat(currentFolder) : " \xb7 upload vai para a raiz"
                                        ]}
                                    </p>
                                ]}
                            </div>,
                             <input
                              ref={fileInputRef}
                              type={"file"}
                              multiple={true}
                              accept={"image/jpeg,image/jpg,image/png,image/webp,video/mp4,video/quicktime,video/webm,.mp4,.mov,.webm"}
                              style={{
                                    display: "none"
                                }}
                              onChange={handleFileInput}
                             />,
                             <button
                              className={"btn btn-sm btn-primary"}
                              onClick={()=>{
                                    var _fileInputRef_current;
                                    return (_fileInputRef_current = fileInputRef.current) === null || _fileInputRef_current === void 0 ? void 0 : _fileInputRef_current.click();
                                }}
                            >
                              {"Selecionar arquivos"}
                            </button>
                        ]}
                    </div>,
                    fila.length > 0 &&  <div
                      style={{
                            padding: "0 1rem 1rem",
                            borderTop: "1px solid var(--border)"
                        }}
                    >
                      {[
                             <div
                              style={{
                                    display: "flex",
                                    alignItems: "center",
                                    gap: "0.75rem",
                                    marginTop: "0.75rem",
                                    marginBottom: "0.75rem",
                                    flexWrap: "wrap"
                                }}
                            >
                              {[
                                     <span
                                      style={{
                                            fontSize: "0.78rem",
                                            color: "var(--text-muted)",
                                            flex: 1
                                        }}
                                    >
                                      {[
                                            okCount,
                                            "/",
                                            fila.length,
                                            " enviadas",
                                            erroCount > 0 &&  <span
                                              style={{
                                                    color: "var(--danger)",
                                                    marginLeft: "0.5rem"
                                                }}
                                            >
                                              {[
                                                    "(",
                                                    erroCount,
                                                    " erro",
                                                    erroCount !== 1 ? "s" : "",
                                                    ")"
                                                ]}
                                            </span>,
                                            ignoredCount > 0 &&  <span
                                              style={{
                                                    color: "#f59e0b",
                                                    marginLeft: "0.5rem"
                                                }}
                                            >
                                              {[
                                                    "(",
                                                    ignoredCount,
                                                    " ignorada",
                                                    ignoredCount !== 1 ? "s" : "",
                                                    ")"
                                                ]}
                                            </span>
                                        ]}
                                    </span>,
                                     <div
                                      style={{
                                            display: "flex",
                                            alignItems: "center",
                                            gap: "0.4rem"
                                        }}
                                    >
                                      {[
                                             <span
                                              style={{
                                                    fontSize: "0.72rem",
                                                    color: "var(--text-dim)"
                                                }}
                                            >
                                              {"Preço aplicado"}
                                            </span>,
                                             <strong
                                              style={{
                                                    fontSize: "0.78rem",
                                                    color: "var(--text)"
                                                }}
                                            >
                                              {"R$ ".concat(Number(precoUpload || 0).toFixed(2).replace(".", ","))}
                                            </strong>
                                        ]}
                                    </div>,
                                     <button
                                      className={"btn btn-sm btn-primary"}
                                      disabled={enviando || pendentesCount === 0}
                                      onClick={enviarFotos}
                                    >
                                      {enviando ? "Enviando..." : "Enviar ".concat(pendentesCount, " foto").concat(pendentesCount !== 1 ? "s" : "")}
                                    </button>,
                                    okCount > 0 &&  <button
                                      className={"btn btn-sm btn-ghost"}
                                      onClick={()=>setFila((prev)=>prev.filter((f)=>f.status !== "ok"))}
                                    >
                                      {"Limpar enviadas"}
                                    </button>,
                                     <button
                                      className={"btn btn-sm btn-ghost"}
                                      style={{
                                            color: "var(--danger)"
                                        }}
                                      onClick={()=>setFila([])}
                                    >
                                      {"✕ Limpar"}
                                    </button>
                                ]}
                            </div>,
                             <div
                              style={{
                                    display: "grid",
                                    gridTemplateColumns: "repeat(auto-fill, minmax(78px, 1fr))",
                                    gap: "0.4rem",
                                    maxHeight: "190px",
                                    overflowY: "auto"
                                }}
                            >
                              {fila.map((item)=> <div
                                style={{
                                            position: "relative",
                                            borderRadius: "var(--radius)",
                                            overflow: "hidden",
                                            border: "1.5px solid ".concat(item.status === "ok" ? "var(--success)" : item.status === "erro" ? "var(--danger)" : item.status === "ignorado" ? "#f59e0b" : item.status === "enviando" ? "var(--accent)" : "var(--border)")
                                        }}
                              >
                                {[
                                             <div
                                              style={{
                                                    height: "58px",
                                                    background: "var(--bg-input)"
                                                }}
                                            >
                                              {item.preview ? <img
                                                src={item.preview}
                                                alt={""}
                                                style={{
                                                        width: "100%",
                                                        height: "100%",
                                                        objectFit: "cover"
                                                    }}
                                               /> : <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1.4rem", background: "linear-gradient(135deg, rgba(99,102,241,0.18), rgba(99,102,241,0.04))" }}>🎬</div>}
                                            </div>,
                                             <div
                                              style={{
                                                    padding: "0.2rem 0.3rem",
                                                    textAlign: "center",
                                                    fontSize: "0.62rem"
                                                }}
                                            >
                                              {item.status === "ok" ?  <span
                                                style={{
                                                        color: "var(--success)"
                                                    }}
                                              >
                                                {"✅"}
                                              </span> : item.status === "erro" ?  <span
                                                style={{
                                                        color: "var(--danger)"
                                                    }}
                                                title={item.error}
                                              >
                                                {"❌"}
                                              </span> : item.status === "ignorado" ?  <span
                                                style={{
                                                        color: "#f59e0b"
                                                    }}
                                                title={item.error}
                                              >
                                                {"⚠️"}
                                              </span> : item.status === "enviando" ?  <div>
                                                {[
                                                         <div
                                                          style={{
                                                                width: "100%",
                                                                height: "3px",
                                                                background: "var(--bg-input)",
                                                                borderRadius: "2px",
                                                                marginBottom: "2px"
                                                            }}
                                                        >
                                                          { <div
                                                            style={{
                                                                    width: "".concat(item.progress || 0, "%"),
                                                                    height: "100%",
                                                                    background: "var(--accent)",
                                                                    borderRadius: "2px",
                                                                    transition: "width 0.2s"
                                                                }}
                                                           />}
                                                        </div>,
                                                         <span
                                                          style={{
                                                                color: "var(--accent)",
                                                                fontSize: "0.58rem",
                                                                lineHeight: 1
                                                            }}
                                                        >
                                                          {[
                                                                item.progress || 0,
                                                                "%",
                                                                item.speed > 0 &&  <>
                                                                  {[
                                                                        " \xb7 ",
                                                                        item.speed > 1048576 ? "".concat((item.speed / 1048576).toFixed(1), "MB/s") : "".concat((item.speed / 1024).toFixed(0), "KB/s")
                                                                    ]}
                                                                </>,
                                                                item.eta != null && item.eta > 0 &&  <>
                                                                  {[
                                                                        " \xb7 ",
                                                                        item.eta < 60 ? "".concat(Math.round(item.eta), "s") : "".concat(Math.round(item.eta / 60), "min")
                                                                    ]}
                                                                </>
                                                            ]}
                                                        </span>
                                                    ]}
                                              </div> :  <input
                                                type={"number"}
                                                step={"0.01"}
                                                min={"0"}
                                                value={item.price}
                                                onChange={(e)=>setFila((prev)=>prev.map((f)=>f.id === item.id ? {
                                                                    ...f,
                                                                    price: Number(e.target.value)
                                                                } : f))}
                                                onClick={(e)=>e.stopPropagation()}
                                                style={{
                                                        width: "100%",
                                                        padding: "0.15rem",
                                                        fontSize: "0.6rem",
                                                        background: "transparent",
                                                        border: "none",
                                                        color: "var(--text)",
                                                        textAlign: "center"
                                                    }}
                                               />}
                                            </div>,
                                            item.status === "pendente" &&  <button
                                              onClick={()=>setFila((prev)=>prev.filter((f)=>f.id !== item.id))}
                                              style={{
                                                    position: "absolute",
                                                    top: "2px",
                                                    right: "2px",
                                                    background: "rgba(0,0,0,0.6)",
                                                    border: "none",
                                                    color: "#fff",
                                                    borderRadius: "50%",
                                                    width: "14px",
                                                    height: "14px",
                                                    fontSize: "8px",
                                                    cursor: "pointer",
                                                    display: "flex",
                                                    alignItems: "center",
                                                    justifyContent: "center"
                                                }}
                                            >
                                              {"✕"}
                                            </button>
                                        ]}
                              </div>)}
                            </div>
                        ]}
                    </div>
                ]}
            </div>,
             <div
              style={{
                    background: "var(--bg-card)",
                    border: "1px solid var(--border)",
                    borderRadius: "var(--radius)",
                    padding: "0.75rem 1rem",
                    marginBottom: "0.75rem",
                    display: "flex",
                    flexWrap: "wrap",
                    gap: "0.75rem",
                    alignItems: "center"
                }}
            >
              {[
                    (event === null || event === void 0 ? void 0 : event.coverImage) &&  <div
                      style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "0.5rem",
                            flexShrink: 0
                        }}
                    >
                      {[
                            (()=>{
                                const coverCandidates = getEventCoverCandidates(event, {
                                    watermark: (event === null || event === void 0 ? void 0 : event.wm_capa) ? "wm" : "clean"
                                });
                                return  <img
                                  src={getFirstUrl(coverCandidates)}
                                  alt={"Capa"}
                                  loading={"lazy"}
                                  style={{
                                        width: "52px",
                                        height: "39px",
                                        objectFit: "cover",
                                        borderRadius: "3px",
                                        border: "1px solid var(--border)"
                                    }}
                                  onError={(e)=>{
                                        if (!applyNextImageFallback(e.target, coverCandidates)) e.target.style.display = "none";
                                    }}
                                 />;
                            })(),
                             <div>
                              {[
                                     <p
                                      style={{
                                            fontSize: "0.68rem",
                                            color: "var(--text-muted)",
                                            fontWeight: 500
                                        }}
                                    >
                                      {"Capa"}
                                    </p>,
                                    !event.coverImageFile ?  <p
                                      style={{
                                            fontSize: "0.62rem",
                                            color: "#f59e0b"
                                        }}
                                    >
                                      {"⚠ arquivo n\xe3o gerado"}
                                    </p> :  <p
                                      style={{
                                            fontSize: "0.62rem",
                                            color: "var(--success)"
                                        }}
                                    >
                                      {[
                                            "✓ ",
                                            event.wm_capa ? "com WM" : "sem WM"
                                        ]}
                                    </p>
                                ]}
                            </div>
                        ]}
                    </div>,
                     <label
                      style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "0.35rem",
                            cursor: "pointer",
                            fontSize: "0.8rem",
                            color: "var(--text-muted)"
                        }}
                    >
                      {[
                             <input
                              type={"checkbox"}
                              checked={wmCapa}
                              onChange={async (e)=>{
                                    const val = e.target.checked;
                                    setWmCapa(val);
                                    await fetch("/api/events/".concat(eventId), {
                                        method: "PATCH",
                                        headers: {
                                            "Content-Type": "application/json"
                                        },
                                        body: JSON.stringify({
                                            wm_capa: val
                                        })
                                    });
                                    if (event === null || event === void 0 ? void 0 : event.coverImage) {
                                        setRegenStatus("loading");
                                        const r = await fetch("/api/events/".concat(eventId, "/regenerate"), {
                                            method: "POST",
                                            headers: {
                                                "Content-Type": "application/json"
                                            },
                                            body: JSON.stringify({
                                                type: "cover"
                                            })
                                        });
                                        if (r.ok) {
                                            const { cover } = await r.json();
                                            if (cover && onEventUpdate) onEventUpdate({
                                                wm_capa: val,
                                                coverImageFile: cover
                                            });
                                            setRegenStatus("ok");
                                        } else setRegenStatus("erro");
                                        setTimeout(()=>setRegenStatus(null), 3000);
                                    } else if (onEventUpdate) onEventUpdate({
                                        wm_capa: val
                                    });
                                }}
                             />,
                            "WM na capa"
                        ]}
                    </label>,
                    (event === null || event === void 0 ? void 0 : event.coverImage) &&  <button
                      className={"btn btn-sm btn-secondary"}
                      disabled={regenStatus === "loading"}
                      title={"Gera o arquivo cover_xxx.jpg (480px) com as configura\xe7\xf5es atuais"}
                      onClick={async ()=>{
                            setRegenStatus("loading");
                            const r = await fetch("/api/events/".concat(eventId, "/regenerate"), {
                                method: "POST",
                                headers: {
                                    "Content-Type": "application/json"
                                },
                                body: JSON.stringify({
                                    type: "cover"
                                })
                            });
                            if (r.ok) {
                                const { cover } = await r.json();
                                if (cover && onEventUpdate) onEventUpdate({
                                    coverImageFile: cover
                                });
                                setRegenStatus("ok");
                            } else setRegenStatus("erro");
                            setTimeout(()=>setRegenStatus(null), 3000);
                        }}
                    >
                      {regenStatus === "loading" ?  <>
                        {[
                                 <div
                                  className={"spinner"}
                                  style={{
                                        width: "10px",
                                        height: "10px"
                                    }}
                                 />,
                                " Gerando..."
                            ]}
                      </> : event.coverImageFile ? "\uD83D\uDD04 Regenerar capa" : "\uD83D\uDDBC Gerar capa"}
                    </button>,
                     <div
                      style={{
                            borderLeft: "1px solid var(--border)",
                            paddingLeft: "0.75rem",
                            display: "flex",
                            alignItems: "center",
                            gap: "0.75rem",
                            flexWrap: "wrap"
                        }}
                    >
                      {[
                             <label
                              style={{
                                    display: "flex",
                                    alignItems: "center",
                                    gap: "0.35rem",
                                    cursor: "pointer",
                                    fontSize: "0.8rem",
                                    color: "var(--text-muted)"
                                }}
                            >
                              {[
                                     <input
                                      type={"checkbox"}
                                      checked={wmMin}
                                      onChange={async (e)=>{
                                            const val = e.target.checked;
                                            setWmMin(val);
                                            await fetch("/api/events/".concat(eventId), {
                                                method: "PATCH",
                                                headers: {
                                                    "Content-Type": "application/json"
                                                },
                                                body: JSON.stringify({
                                                    wm_miniaturas: val
                                                })
                                            });
                                            if (onEventUpdate) onEventUpdate({
                                                wm_miniaturas: val
                                            });
                                        }}
                                     />,
                                    "WM nas miniaturas"
                                ]}
                            </label>,
                             <button
                              className={"btn btn-sm btn-ghost"}
                              disabled={regenStatus === "loading"}
                              title={"Regenera thumb_xxx.jpg de todas as fotos do \xe1lbum com as configura\xe7\xf5es atuais"}
                              onClick={async ()=>{
                                    const accepted = await confirm({
                                        title: "Regenerar miniaturas",
                                        message: "Regenerar todas as ".concat(activePhotos.length, " miniatura").concat(activePhotos.length !== 1 ? "s" : "", " ").concat(wmMin ? "COM" : "SEM", " marca d'\xe1gua? Isso pode demorar alguns segundos."),
                                        confirmText: "Regenerar",
                                        cancelText: "Cancelar"
                                    });
                                    if (!accepted) return;
                                    setRegenStatus("loading");
                                    const r = await fetch("/api/events/".concat(eventId, "/regenerate"), {
                                        method: "POST",
                                        headers: {
                                            "Content-Type": "application/json"
                                        },
                                        body: JSON.stringify({
                                            type: "thumbs"
                                        })
                                    });
                                    if (r.ok) {
                                        const { thumbsRegenerated } = await r.json();
                                        showMsg("✓ ".concat(thumbsRegenerated, " miniatura").concat(thumbsRegenerated !== 1 ? "s" : "", " regenerada").concat(thumbsRegenerated !== 1 ? "s" : "", "!"));
                                        setRegenStatus("ok");
                                    } else setRegenStatus("erro");
                                    setTimeout(()=>setRegenStatus(null), 3000);
                                }}
                            >
                              {regenStatus === "loading" ?  <>
                                {[
                                         <div
                                          className={"spinner"}
                                          style={{
                                                width: "10px",
                                                height: "10px"
                                            }}
                                         />,
                                        " Aguarde..."
                                    ]}
                              </> : "\uD83D\uDD04 Regenerar miniaturas"}
                            </button>
                        ]}
                    </div>,
                    regenStatus === "ok" &&  <span
                      style={{
                            fontSize: "0.75rem",
                            color: "var(--success)"
                        }}
                    >
                      {"✓ Feito"}
                    </span>,
                    regenStatus === "erro" &&  <span
                      style={{
                            fontSize: "0.75rem",
                            color: "var(--danger)"
                        }}
                    >
                      {"✗ Erro — tente novamente"}
                    </span>
                ]}
            </div>,
             <div
              style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "0.5rem",
                    marginBottom: "0.75rem",
                    flexWrap: "wrap"
                }}
            >
              {[
                     <button
                      className={"btn btn-sm ".concat(currentFolder === null ? "btn-primary" : "btn-ghost")}
                      onClick={()=>{
                            setCurrentFolder(null);
                            setPage(1);
                            setSelected(new Set());
                        }}
                    >
                      {[
                            "\uD83C\uDFE0 Raiz",
                            currentFolder === null && " (".concat(activePhotos.filter((p)=>!p.pasta).length, " foto").concat(activePhotos.filter((p)=>!p.pasta).length !== 1 ? "s" : "", ")")
                        ]}
                    </button>,
                    currentFolder !== null &&  <>
                      {[
                            ...currentFolder.split("/").map((part, idx, arr)=>{
                                const path = arr.slice(0, idx + 1).join("/");
                                const isLast = idx === arr.length - 1;
                                return  <>
                                  {[
                                         <span
                                          style={{
                                                color: "var(--text-dim)"
                                            }}
                                        >
                                          {"›"}
                                        </span>,
                                        isLast ?  <span
                                          className={"btn btn-sm btn-primary"}
                                          style={{
                                                cursor: "default"
                                            }}
                                        >
                                          {[
                                                "📂 ",
                                                part,
                                                " (",
                                                displayItems.length,
                                                ")"
                                            ]}
                                        </span> :  <button
                                          className={"btn btn-sm btn-ghost"}
                                          onClick={()=>{
                                                setCurrentFolder(path);
                                                setPage(1);
                                                setSelected(new Set());
                                            }}
                                        >
                                          {["📂 ", part]}
                                        </button>
                                    ]}
                                </>;
                            }),
                             <button
                              className={"btn btn-ghost btn-sm"}
                              style={{
                                    fontSize: "0.65rem",
                                    padding: "0.2rem 0.35rem",
                                    color: "var(--text-dim)"
                                }}
                              title={"Renomear esta pasta"}
                              onClick={()=>{
                                    setRenameOld(currentFolder);
                                    setRenameNew(currentFolder);
                                    setShowRenameModal(true);
                                }}
                            >
                              {"✏️ Renomear"}
                            </button>
                        ]}
                    </>,
                     <div
                      style={{
                            marginLeft: "auto",
                            display: "flex",
                            alignItems: "center",
                            gap: "0.5rem",
                            flexWrap: "wrap"
                        }}
                    >
                      {[
                             <input
                              type={"text"}
                              className={"form-input"}
                              placeholder={"\uD83D\uDD0D Buscar por ID p\u00FAblico ou nome original..."}
                              value={searchText}
                              onChange={(e)=>setSearchText(e.target.value)}
                              style={{
                                    fontSize: "0.78rem",
                                    padding: "0.3rem 0.55rem",
                                    width: "260px"
                                }}
                             />,
                             <span
                              style={{
                                    fontSize: "0.75rem",
                                    color: "var(--text-dim)"
                                }}
                            >
                              {[
                                    activePhotos.length,
                                    " foto",
                                    activePhotos.length !== 1 ? "s" : "",
                                    " \xb7 ",
                                    folders.length,
                                    " pasta",
                                    folders.length !== 1 ? "s" : ""
                                ]}
                            </span>,
                             <button
                              className={"btn btn-ghost btn-sm"}
                              style={{
                                    fontSize: "0.72rem"
                                }}
                              onClick={()=>{
                                    setNewFoldersText("");
                                    setShowCreateFoldersModal(true);
                                }}
                            >
                              {"\uD83D\uDCC1+ Pastas"}
                            </button>
                        ]}
                    </div>
                ]}
            </div>,
            (selected.size > 0 || selectedFolders.size > 0) &&  <div
              style={{
                    display: "flex",
                    gap: "0.5rem",
                    alignItems: "center",
                    flexWrap: "wrap",
                    padding: "0.6rem 1rem",
                    marginBottom: "1rem",
                    background: "rgba(201,169,110,0.08)",
                    border: "1px solid rgba(201,169,110,0.3)",
                    borderRadius: "var(--radius)"
                }}
            >
              {[
                     <span
                      style={{
                            fontSize: "0.82rem",
                            fontWeight: 600,
                            color: "var(--accent)"
                        }}
                    >
                      {[
                            selected.size > 0 && [selected.size, " foto", selected.size !== 1 ? "s" : ""],
                            selected.size > 0 && selectedFolders.size > 0 && " + ",
                            selectedFolders.size > 0 && [selectedFolders.size, " pasta", selectedFolders.size !== 1 ? "s" : ""]
                        ]}
                    </span>,
                     <button
                      className={"btn btn-sm btn-ghost"}
                      onClick={()=>{
                            setMoveTreeTarget("");
                            setMoveTreeNewName("");
                            setMoveTreeError("");
                            setShowMoveModal(true);
                        }}
                      disabled={busy}
                    >
                      {"\uD83D\uDCC2 Mover"}
                    </button>,
                     <button
                      className={"btn btn-sm btn-ghost"}
                      onClick={()=>setShowPriceModal(true)}
                      disabled={busy}
                    >
                      {"\uD83D\uDCB2 Alterar pre\xe7o"}
                    </button>,
                     <button
                      className={"btn btn-sm btn-ghost"}
                      onClick={()=>bulkPatch({
                                gratis: true
                            })}
                      disabled={busy}
                    >
                      {"\uD83C\uDF81 Marcar gr\xe1tis"}
                    </button>,
                     <button
                      className={"btn btn-sm btn-ghost"}
                      onClick={()=>bulkPatch({
                                gratis: false
                            })}
                      disabled={busy}
                    >
                      {"\uD83D\uDCB0 Remover gr\xe1tis"}
                    </button>,
                     <button
                      className={"btn btn-sm"}
                      style={{
                            color: "var(--danger)",
                            border: "1px solid var(--danger)",
                            background: "transparent",
                            marginLeft: "auto"
                        }}
                      disabled={busy}
                      onClick={()=>{
                            const pastaAtual = currentFolder === null ? "__album__" : currentFolder;
                            requestDeletePhotos({
                                ids: selectedArr,
                                pasta: pastaAtual
                            });
                        }}
                    >
                      {"\uD83D\uDDD1 Remover"}
                    </button>,
                     <button
                      className={"btn btn-sm"}
                      title={"Excluir definitivamente se seguro"}
                      style={{
                            color: "var(--danger)",
                            border: "1px solid var(--danger)",
                            background: "transparent"
                        }}
                      disabled={busy}
                      onClick={()=>{
                            const pastaAtual = currentFolder === null ? "__album__" : currentFolder;
                            requestDeletePhotos({
                                ids: selectedArr,
                                pasta: pastaAtual,
                                permanent: true
                            });
                        }}
                    >
                      {"X Definitivo"}
                    </button>,
                     <button
                      className={"btn btn-ghost btn-sm"}
                      onClick={()=>{
                            setSelected(new Set());
                            setSelectedFolders(new Set());
                        }}
                    >
                      {"✕"}
                    </button>
                ]}
            </div>,
            searchResults &&  <div
              style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "0.5rem",
                    flexWrap: "wrap",
                    padding: "0.5rem 0.85rem",
                    marginBottom: "0.75rem",
                    background: "rgba(201,169,110,0.06)",
                    border: "1px solid rgba(201,169,110,0.2)",
                    borderRadius: "var(--radius)"
                }}
            >
              {[
                     <span
                      style={{
                            fontSize: "0.8rem",
                            color: "var(--text-muted)"
                        }}
                    >
                      {[
                            "🔍 ",
                             <strong>{[searchResults.length, " resultado", searchResults.length !== 1 ? "s" : ""]}</strong>,
                            ' para "',
                            debouncedSearch,
                            '" no álbum'
                        ]}
                    </span>,
                     <button
                      className={"btn btn-ghost btn-sm"}
                      style={{
                            marginLeft: "auto",
                            fontSize: "0.72rem"
                        }}
                      onClick={()=>setSearchText("")}
                    >
                      {"✕ Limpar busca"}
                    </button>
                ]}
            </div>,
            searchResults && searchResults.length === 0 ?  <div
              className={"empty-state"}
            >
              {[
                     <div className={"empty-state-icon"}>{"🔍"}</div>,
                     <h2 className={"empty-state-title"}>{"Nenhuma foto encontrada"}</h2>,
                     <p style={{ fontSize: "0.85rem", color: "var(--text-dim)" }}>{"Tente outro ID público ou parte do nome do arquivo."}</p>
                ]}
            </div> : !searchResults && currentFolder === null && folders.length === 0 && displayItems.length === 0 ?  <div
              className={"empty-state"}
            >
              {[
                     <div
                      className={"empty-state-icon"}
                    >
                      {"\uD83D\uDCF7"}
                    </div>,
                     <h2
                      className={"empty-state-title"}
                    >
                      {"Nenhuma foto ainda"}
                    </h2>,
                     <p
                      style={{
                            fontSize: "0.85rem",
                            color: "var(--text-dim)"
                        }}
                    >
                      {"Arraste fotos para a zona acima para fazer upload."}
                    </p>
                ]}
            </div> : !searchResults && currentFolder !== null && displayItems.length === 0 && subfolders.length === 0 ?  <div
              className={"empty-state"}
            >
              {[
                     <div
                      className={"empty-state-icon"}
                    >
                      {"\uD83D\uDCC2"}
                    </div>,
                     <h2
                      className={"empty-state-title"}
                    >
                      {"Pasta vazia"}
                    </h2>,
                     <p
                      style={{
                            fontSize: "0.85rem",
                            color: "var(--text-dim)"
                        }}
                    >
                      {'Mova fotos para c\xe1 usando "Mover" na barra de sele\xe7\xe3o.'}
                    </p>
                ]}
            </div> :  <>
              {[
                    displayItems.length > 0 &&  <div
                      style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "0.75rem",
                            marginBottom: "0.5rem",
                            flexWrap: "wrap"
                        }}
                    >
                      {[
                             <label
                              style={{
                                    display: "flex",
                                    alignItems: "center",
                                    gap: "0.4rem",
                                    cursor: "pointer",
                                    fontSize: "0.78rem",
                                    color: "var(--text-muted)"
                                }}
                            >
                              {[
                                     <input
                                      type={"checkbox"}
                                      checked={allPageSelected}
                                      onChange={selectAll}
                                     />,
                                    "Selecionar p\xe1gina (",
                                    pageItems.length,
                                    ")"
                                ]}
                            </label>,
                            displayItems.length > pageItems.length && !allItemsSelected &&  <button
                              className={"btn btn-ghost btn-sm"}
                              style={{
                                    fontSize: "0.72rem"
                                }}
                              onClick={selectAllItems}
                            >
                              {[
                                    "Selecionar todas as ",
                                    displayItems.length,
                                    " da pasta"
                                ]}
                            </button>,
                            allItemsSelected &&  <span
                              style={{
                                    fontSize: "0.72rem",
                                    color: "var(--accent)"
                                }}
                            >
                              {[
                                    "✓ Todas as ",
                                    displayItems.length,
                                    " selecionadas"
                                ]}
                            </span>
                        ]}
                    </div>,
                     <div
                      style={{
                            display: "grid",
                            gridTemplateColumns: "repeat(auto-fill, minmax(130px, 1fr))",
                            gap: "0.5rem",
                            userSelect: "none"
                        }}
                    >
                      {[
                            !searchResults && subfolders.map((f)=>{
                                const directCount = activePhotos.filter((p)=>p.pasta === f).length;
                                const recursiveCount = activePhotos.filter((p)=>p.pasta === f || (p.pasta || "").startsWith(f + "/")).length;
                                const leafName = f.split("/").pop();
                                const pastaCoverFile = event?.pastasCapas?.[f];
                                const coverPhoto = pastaCoverFile ? (activePhotos.find((p)=>p.pasta === f && p.filename === pastaCoverFile) || activePhotos.find((p)=>(p.pasta || "") === f || (p.pasta || "").startsWith(f + "/"))) : activePhotos.find((p)=>(p.pasta || "") === f || (p.pasta || "").startsWith(f + "/"));
                                const folderThumbCandidates = coverPhoto ? getPhotoCartPreviewCandidates(coverPhoto) : [];
                                const folderThumbSrc = getFirstUrl(folderThumbCandidates);
                                const isFolderSelected = selectedFolders.has(f);
                                return  <div
                                  onClick={()=>{
                                        setCurrentFolder(f);
                                        setPage(1);
                                        setSelected(new Set());
                                    }}
                                  style={{
                                        background: "var(--bg-card)",
                                        border: "2px solid ".concat(isFolderSelected ? "var(--accent)" : "var(--border)"),
                                        borderRadius: "var(--radius)",
                                        overflow: "hidden",
                                        cursor: "pointer",
                                        transition: "border-color 0.15s",
                                        position: "relative"
                                    }}
                                  onMouseEnter={(e)=>{ if (!isFolderSelected) e.currentTarget.style.borderColor = "var(--accent)"; }}
                                  onMouseLeave={(e)=>{ if (!isFolderSelected) e.currentTarget.style.borderColor = "var(--border)"; }}
                                >
                                  {[
                                         <div
                                          style={{
                                                height: "95px",
                                                background: "var(--bg-input)",
                                                position: "relative",
                                                display: "flex",
                                                alignItems: "center",
                                                justifyContent: "center"
                                            }}
                                        >
                                          {folderThumbSrc ?  <>
                                            {[
                                                     <img
                                                      src={folderThumbSrc}
                                                      alt={""}
                                                      loading={"lazy"}
                                                      style={{
                                                            width: "100%",
                                                            height: "100%",
                                                            objectFit: "cover",
                                                            opacity: 0.45
                                                        }}
                                                      onError={(e)=>{
                                                            if (!applyNextImageFallback(e.target, folderThumbCandidates)) e.target.style.display = "none";
                                                        }}
                                                     />,
                                                     <span
                                                      style={{
                                                            position: "absolute",
                                                            fontSize: "2rem"
                                                        }}
                                                    >
                                                      {"\uD83D\uDCC2"}
                                                    </span>
                                                ]}
                                          </> :  <span
                                            style={{
                                                    fontSize: "2.5rem"
                                                }}
                                          >
                                            {"\uD83D\uDCC1"}
                                          </span>}
                                        </div>,
                                         <div
                                          style={{
                                                padding: "0.35rem 0.4rem"
                                            }}
                                        >
                                          {[
                                                 <p
                                                  style={{
                                                        fontSize: "0.73rem",
                                                        fontWeight: 600,
                                                        color: "var(--text)",
                                                        overflow: "hidden",
                                                        textOverflow: "ellipsis",
                                                        whiteSpace: "nowrap"
                                                    }}
                                                >
                                                  {leafName}
                                                </p>,
                                                 <p
                                                  style={{
                                                        fontSize: "0.62rem",
                                                        color: "var(--text-dim)"
                                                    }}
                                                >
                                                  {[
                                                        recursiveCount,
                                                        " foto",
                                                        recursiveCount !== 1 ? "s" : "",
                                                        directCount !== recursiveCount && " (".concat(directCount, " direta", directCount !== 1 ? "s" : "", ")")
                                                    ]}
                                                </p>
                                            ]}
                                        </div>,
                                         <div
                                          onClick={(e)=>{
                                                e.stopPropagation();
                                                toggleSelectFolder(f);
                                            }}
                                          title={isFolderSelected ? "Desmarcar pasta" : "Selecionar pasta"}
                                          style={{
                                                position: "absolute",
                                                top: "4px",
                                                left: "4px",
                                                zIndex: 2,
                                                width: "16px",
                                                height: "16px",
                                                borderRadius: "3px",
                                                background: isFolderSelected ? "var(--accent)" : "rgba(0,0,0,0.5)",
                                                border: "1.5px solid rgba(255,255,255,0.6)",
                                                display: "flex",
                                                alignItems: "center",
                                                justifyContent: "center",
                                                fontSize: "10px",
                                                color: "#000",
                                                fontWeight: 700,
                                                cursor: "pointer"
                                            }}
                                        >
                                          {isFolderSelected ? "✓" : ""}
                                        </div>,
                                         <button
                                          onClick={(e)=>{
                                                e.stopPropagation();
                                                setRenameOld(f);
                                                setRenameNew(f);
                                                setShowRenameModal(true);
                                            }}
                                          title={"Renomear pasta"}
                                          style={{
                                                position: "absolute",
                                                top: "4px",
                                                right: "4px",
                                                zIndex: 2,
                                                background: "rgba(0,0,0,0.5)",
                                                border: "none",
                                                color: "#fff",
                                                borderRadius: "4px",
                                                padding: "2px 5px",
                                                fontSize: "0.6rem",
                                                cursor: "pointer"
                                            }}
                                        >
                                          {"✏️"}
                                        </button>
                                    ]}
                                </div>;
                            }),
                            (searchResults ?? pageItems).map((photo)=>{
                                var _photo_id;
                                const thumbCandidates = getPhotoCartPreviewCandidates(photo);
                                const thumbSrc = getFirstUrl(thumbCandidates);
                                const isSel = selected.has(photo.id);
                                const isCover = (event === null || event === void 0 ? void 0 : event.coverImage) === photo.filename;
                                return  <div
                                  onMouseDown={(e)=>{ if (e.shiftKey) e.preventDefault(); }}
                                  onClick={(e)=>handlePhotoSelectClick(e, photo.id)}
                                  style={{
                                        background: "var(--bg-card)",
                                        border: "2px solid ".concat(isSel ? "var(--accent)" : isCover ? "var(--success)" : "var(--border)"),
                                        borderRadius: "var(--radius)",
                                        overflow: "hidden",
                                        position: "relative",
                                        cursor: "pointer",
                                        transition: "border-color 0.15s"
                                    }}
                                >
                                  {[
                                         <div
                                          style={{
                                                position: "absolute",
                                                top: "4px",
                                                left: "4px",
                                                zIndex: 2,
                                                width: "16px",
                                                height: "16px",
                                                borderRadius: "3px",
                                                background: isSel ? "var(--accent)" : "rgba(0,0,0,0.5)",
                                                border: "1.5px solid rgba(255,255,255,0.6)",
                                                display: "flex",
                                                alignItems: "center",
                                                justifyContent: "center",
                                                fontSize: "10px",
                                                color: "#000",
                                                fontWeight: 700
                                            }}
                                        >
                                          {isSel ? "✓" : ""}
                                        </div>,
                                        photo.gratis ?  <div
                                          style={{
                                                position: "absolute",
                                                top: "4px",
                                                right: "4px",
                                                zIndex: 2,
                                                background: "var(--accent)",
                                                color: "#000",
                                                fontSize: "0.55rem",
                                                fontWeight: 700,
                                                padding: "1px 4px",
                                                borderRadius: "3px"
                                            }}
                                        >
                                          {"GR\xc1TIS"}
                                        </div> : isCover ?  <div
                                          style={{
                                                position: "absolute",
                                                top: "4px",
                                                right: "4px",
                                                zIndex: 2,
                                                background: "var(--success)",
                                                color: "#fff",
                                                fontSize: "0.52rem",
                                                fontWeight: 700,
                                                padding: "1px 4px",
                                                borderRadius: "3px"
                                            }}
                                        >
                                          {"CAPA"}
                                        </div> : null,
                                         <div
                                          style={{
                                                height: "95px",
                                                background: "var(--bg-input)",
                                                cursor: "zoom-in"
                                            }}
                                          onClick={(e)=>{
                                                e.stopPropagation();
                                                setAdminPhotoModalId(photo.id);
                                            }}
                                        >
                                          { <img
                                            src={thumbSrc}
                                            alt={""}
                                            loading={"lazy"}
                                            style={{
                                                    width: "100%",
                                                    height: "100%",
                                                    objectFit: "cover",
                                                    pointerEvents: "none"
                                                }}
                                            onError={(e)=>{
                                                    if (!applyNextImageFallback(e.target, thumbCandidates)) e.target.style.display = "none";
                                                }}
                                           />}
                                        </div>,
                                         <button
                                          onClick={(e)=>{
                                                e.stopPropagation();
                                                if (!isCover) setCover(photo);
                                            }}
                                          disabled={coverUpdating === photo.id || isCover}
                                          title={isCover ? "Esta \xe9 a capa atual" : "Definir como capa do \xe1lbum"}
                                          style={{
                                                position: "absolute",
                                                bottom: "28px",
                                                right: "3px",
                                                zIndex: 3,
                                                background: isCover ? "var(--success)" : "rgba(0,0,0,0.55)",
                                                border: "none",
                                                color: "#fff",
                                                borderRadius: "4px",
                                                padding: "2px 4px",
                                                fontSize: "0.55rem",
                                                cursor: isCover ? "default" : "pointer",
                                                lineHeight: 1
                                            }}
                                        >
                                          {coverUpdating === photo.id ? "⏳" : isCover ? "⭐ capa" : "☆"}
                                        </button>,
                                         <button
                                          onClick={(e)=>{
                                                e.stopPropagation();
                                                requestDeletePhotos({ ids: [photo.id], pasta: currentFolder === null ? "__album__" : currentFolder });
                                            }}
                                          title={"Remover foto"}
                                          style={{
                                                position: "absolute",
                                                bottom: "28px",
                                                left: "3px",
                                                zIndex: 3,
                                                background: "rgba(0,0,0,0.55)",
                                                border: "none",
                                                color: "rgba(255,80,80,0.9)",
                                                borderRadius: "4px",
                                                padding: "2px 5px",
                                                fontSize: "0.6rem",
                                                cursor: "pointer",
                                                lineHeight: 1
                                            }}
                                        >
                                          {"🗑"}
                                        </button>,
                                         <div
                                          style={{
                                                padding: "0.3rem 0.4rem"
                                            }}
                                        >
                                          {[
                                                 <p
                                                  style={{
                                                        fontSize: "0.62rem",
                                                        color: "var(--text-dim)",
                                                        fontFamily: "monospace",
                                                        overflow: "hidden",
                                                        textOverflow: "ellipsis",
                                                        whiteSpace: "nowrap",
                                                        textAlign: "center",
                                                        padding: "0 26px"
                                                    }}
                                                >
                                                  {[
                                                        "#",
                                                        photo.publicId || ((_photo_id = photo.id) === null || _photo_id === void 0 ? void 0 : _photo_id.slice(0, 8))
                                                    ]}
                                                </p>,
                                                searchResults && photo.pasta &&  <p
                                                  onClick={(e)=>{
                                                        e.stopPropagation();
                                                        setCurrentFolder(photo.pasta);
                                                        setPage(1);
                                                        setSearchText("");
                                                    }}
                                                  title={"Abrir pasta " + photo.pasta}
                                                  style={{
                                                        fontSize: "0.6rem",
                                                        color: "var(--accent)",
                                                        overflow: "hidden",
                                                        textOverflow: "ellipsis",
                                                        whiteSpace: "nowrap",
                                                        cursor: "pointer",
                                                        textDecoration: "underline"
                                                    }}
                                                >
                                                  {["📂 ", photo.pasta]}
                                                </p>,
                                                 <div
                                                  style={{
                                                        display: "flex",
                                                        justifyContent: "space-between",
                                                        alignItems: "center"
                                                    }}
                                                >
                                                  {[
                                                         <p
                                                          style={{
                                                                fontSize: "0.65rem",
                                                                color: photo.gratis ? "var(--accent)" : "var(--success)"
                                                            }}
                                                        >
                                                          {photo.gratis ? "Gr\xe1tis" : "R$ ".concat((Number(photo.price) || 0).toFixed(2).replace(".", ","))}
                                                        </p>,
                                                         <button
                                                          className={"btn btn-ghost"}
                                                          style={{
                                                                fontSize: "0.6rem",
                                                                padding: "0.1rem 0.25rem",
                                                                color: photo.gratis ? "var(--accent)" : "var(--text-dim)"
                                                            }}
                                                          title={photo.gratis ? "Remover gratuidade" : "Marcar como gr\xe1tis"}
                                                          onClick={(e)=>{
                                                                e.stopPropagation();
                                                                handleToggleFree(photo);
                                                            }}
                                                        >
                                                          {"\uD83C\uDF81"}
                                                        </button>
                                                    ]}
                                                </div>
                                            ]}
                                        </div>
                                    ]}
                                </div>;
                            })
                        ]}
                    </div>,
                    !searchResults && totalPages > 1 &&  <div
                      style={{
                            display: "flex",
                            justifyContent: "center",
                            gap: "0.5rem",
                            marginTop: "1.5rem"
                        }}
                    >
                      {[
                             <button
                              className={"btn btn-sm btn-ghost"}
                              disabled={page <= 1}
                              onClick={()=>setPage((p)=>p - 1)}
                            >
                              {"← Anterior"}
                            </button>,
                             <span
                              style={{
                                    fontSize: "0.82rem",
                                    color: "var(--text-muted)",
                                    padding: "0.4rem"
                                }}
                            >
                              {[
                                    page,
                                    " / ",
                                    totalPages
                                ]}
                            </span>,
                             <button
                              className={"btn btn-sm btn-ghost"}
                              disabled={page >= totalPages}
                              onClick={()=>setPage((p)=>p + 1)}
                            >
                              {"Pr\xf3xima →"}
                            </button>
                        ]}
                    </div>
                ]}
            </>,
            showMoveModal &&  <div
              style={{
                    position: "fixed",
                    inset: 0,
                    zIndex: 9999,
                    background: "rgba(0,0,0,0.7)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    padding: "1rem"
                }}
              onClick={()=>{
                    setShowMoveModal(false);
                    setMoveTreeError("");
                    setMoveTreeNewName("");
                }}
            >
              { <div
                style={{
                        background: "var(--bg-card)",
                        border: "1px solid var(--border)",
                        borderRadius: "var(--radius-lg)",
                        padding: "1.5rem",
                        minWidth: "320px",
                        maxWidth: "520px",
                        width: "100%",
                        maxHeight: "85vh",
                        overflow: "auto"
                    }}
                onClick={(e)=>e.stopPropagation()}
              >
                {[
                         <h3
                          style={{
                                marginBottom: "0.5rem",
                                fontSize: "0.95rem"
                            }}
                        >
                          {[
                                "Mover ",
                                selected.size > 0 && [selected.size, " foto", selected.size !== 1 ? "s" : ""],
                                selected.size > 0 && selectedFolders.size > 0 && " e ",
                                selectedFolders.size > 0 && [selectedFolders.size, " pasta", selectedFolders.size !== 1 ? "s" : ""]
                            ]}
                        </h3>,
                         <p
                          style={{
                                fontSize: "0.75rem",
                                color: "var(--text-dim)",
                                marginBottom: "0.75rem"
                            }}
                        >
                          {"Selecione a pasta de destino. Use o campo abaixo para criar uma nova pasta/subpasta."}
                        </p>,
                         <div
                          style={{
                                border: "1px solid var(--border)",
                                borderRadius: "var(--radius)",
                                padding: "0.5rem",
                                marginBottom: "0.75rem",
                                maxHeight: "260px",
                                overflowY: "auto"
                            }}
                        >
                          {[
                                 <div
                                  onClick={()=>setMoveTreeTarget("")}
                                  style={{
                                        padding: "0.4rem 0.5rem",
                                        cursor: "pointer",
                                        borderRadius: "4px",
                                        background: moveTreeTarget === "" ? "rgba(201,169,110,0.15)" : "transparent",
                                        fontWeight: moveTreeTarget === "" ? 600 : 400,
                                        fontSize: "0.85rem"
                                    }}
                                >
                                  {"🏠 Raiz"}
                                </div>,
                                folders.map((f)=>{
                                    const depth = f.split("/").length - 1;
                                    const leaf = f.split("/").pop();
                                    const isDisabled = selectedFolders.has(f) || [
                                        ...selectedFolders
                                    ].some((sf)=>f === sf || f.startsWith(sf + "/"));
                                    return  <div
                                      key={f}
                                      onClick={()=>!isDisabled && setMoveTreeTarget(f)}
                                      title={isDisabled ? "Não disponível (própria pasta ou descendente)" : f}
                                      style={{
                                            padding: "0.4rem 0.5rem",
                                            paddingLeft: 0.5 + depth * 1 + "rem",
                                            cursor: isDisabled ? "not-allowed" : "pointer",
                                            borderRadius: "4px",
                                            background: moveTreeTarget === f ? "rgba(201,169,110,0.15)" : "transparent",
                                            fontWeight: moveTreeTarget === f ? 600 : 400,
                                            fontSize: "0.82rem",
                                            color: isDisabled ? "var(--text-dim)" : "var(--text)",
                                            opacity: isDisabled ? 0.5 : 1
                                        }}
                                    >
                                      {["📂 ", leaf]}
                                    </div>;
                                })
                            ]}
                        </div>,
                         <div
                          style={{
                                display: "flex",
                                gap: "0.4rem",
                                marginBottom: "0.5rem",
                                alignItems: "center"
                            }}
                        >
                          {[
                                 <span
                                  style={{
                                        fontSize: "0.78rem",
                                        color: "var(--text-dim)",
                                        whiteSpace: "nowrap"
                                    }}
                                >
                                  {moveTreeTarget ? "📂 " + moveTreeTarget + " /" : "🏠 raiz /"}
                                </span>,
                                 <input
                                  type={"text"}
                                  className={"form-input"}
                                  placeholder={"Nova subpasta (opcional)"}
                                  value={moveTreeNewName}
                                  onChange={(e)=>setMoveTreeNewName(e.target.value.replace(/\//g, ""))}
                                  style={{
                                        flex: 1
                                    }}
                                 />
                            ]}
                        </div>,
                        moveTreeError &&  <p
                          style={{
                                fontSize: "0.75rem",
                                color: "var(--danger)",
                                marginBottom: "0.5rem"
                            }}
                        >
                          {moveTreeError}
                        </p>,
                         <div
                          style={{
                                display: "flex",
                                gap: "0.5rem"
                            }}
                        >
                          {[
                                 <button
                                  className={"btn btn-primary btn-sm"}
                                  onClick={handleMoveViaTree}
                                  disabled={busy || (selected.size === 0 && selectedFolders.size === 0)}
                                >
                                  {busy ? "Movendo..." : "Mover"}
                                </button>,
                                 <button
                                  className={"btn btn-ghost btn-sm"}
                                  onClick={()=>{
                                        setShowMoveModal(false);
                                        setMoveTreeError("");
                                        setMoveTreeNewName("");
                                    }}
                                >
                                  {"Cancelar"}
                                </button>
                            ]}
                        </div>
                    ]}
              </div>}
            </div>,
            showPriceModal &&  <div
              style={{
                    position: "fixed",
                    inset: 0,
                    zIndex: 9999,
                    background: "rgba(0,0,0,0.7)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center"
                }}
              onClick={()=>setShowPriceModal(false)}
            >
              { <div
                style={{
                        background: "var(--bg-card)",
                        border: "1px solid var(--border)",
                        borderRadius: "var(--radius-lg)",
                        padding: "1.5rem",
                        minWidth: "280px"
                    }}
                onClick={(e)=>e.stopPropagation()}
              >
                {[
                         <h3
                          style={{
                                marginBottom: "1rem",
                                fontSize: "0.95rem"
                            }}
                        >
                          {[
                                "Novo pre\xe7o para ",
                                selected.size,
                                " foto",
                                selected.size !== 1 ? "s" : ""
                            ]}
                        </h3>,
                         <input
                          type={"text"}
                          inputMode={"decimal"}
                          className={"form-input"}
                          placeholder={"Ex: 19,90"}
                          value={novoPreco}
                          onChange={(e)=>setNovoPreco(e.target.value)}
                          style={{
                                marginBottom: "0.75rem"
                            }}
                          autoFocus={true}
                         />,
                         <div
                          style={{
                                display: "flex",
                                gap: "0.5rem"
                            }}
                        >
                          {[
                                 <button
                                  className={"btn btn-primary btn-sm"}
                                  onClick={handleBulkPrice}
                                  disabled={busy}
                                >
                                  {busy ? "Salvando..." : "Salvar"}
                                </button>,
                                 <button
                                  className={"btn btn-ghost btn-sm"}
                                  onClick={()=>setShowPriceModal(false)}
                                >
                                  {"Cancelar"}
                                </button>
                            ]}
                        </div>
                    ]}
              </div>}
            </div>,
            showRenameModal &&  <div
              style={{
                    position: "fixed",
                    inset: 0,
                    zIndex: 9999,
                    background: "rgba(0,0,0,0.7)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center"
                }}
              onClick={()=>setShowRenameModal(false)}
            >
              { <div
                style={{
                        background: "var(--bg-card)",
                        border: "1px solid var(--border)",
                        borderRadius: "var(--radius-lg)",
                        padding: "1.5rem",
                        minWidth: "300px"
                    }}
                onClick={(e)=>e.stopPropagation()}
              >
                {[
                         <h3
                          style={{
                                marginBottom: "1rem",
                                fontSize: "0.95rem"
                            }}
                        >
                          {[
                                'Renomear pasta "',
                                renameOld,
                                '"'
                            ]}
                        </h3>,
                         <input
                          type={"text"}
                          className={"form-input"}
                          placeholder={"Novo nome"}
                          value={renameNew}
                          onChange={(e)=>setRenameNew(e.target.value)}
                          style={{
                                marginBottom: "0.75rem"
                            }}
                          autoFocus={true}
                         />,
                         <div
                          style={{
                                display: "flex",
                                gap: "0.5rem"
                            }}
                        >
                          {[
                                 <button
                                  className={"btn btn-primary btn-sm"}
                                  onClick={handleRenameFolder}
                                  disabled={busy || !renameNew.trim()}
                                >
                                  {busy ? "Renomeando..." : "Renomear"}
                                </button>,
                                 <button
                                  className={"btn btn-ghost btn-sm"}
                                  onClick={()=>setShowRenameModal(false)}
                                >
                                  {"Cancelar"}
                                </button>
                            ]}
                        </div>
                    ]}
              </div>}
            </div>,
            showCreateFoldersModal &&  <div
              style={{
                    position: "fixed",
                    inset: 0,
                    zIndex: 9999,
                    background: "rgba(0,0,0,0.75)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    padding: "1rem"
                }}
              onClick={()=>setShowCreateFoldersModal(false)}
            >
              { <div
                style={{
                        background: "var(--bg-card)",
                        border: "1px solid var(--border)",
                        borderRadius: "var(--radius-lg)",
                        padding: "1.5rem",
                        minWidth: "320px",
                        maxWidth: "440px",
                        width: "100%"
                    }}
                onClick={(e)=>e.stopPropagation()}
              >
                {[
                         <h3
                          style={{
                                marginBottom: "0.4rem",
                                fontSize: "0.95rem"
                            }}
                        >
                          {"\uD83D\uDCC1 Criar pasta(s)"}
                        </h3>,
                         <p
                          style={{
                                fontSize: "0.78rem",
                                color: "var(--text-dim)",
                                marginBottom: "0.75rem"
                            }}
                        >
                          {"Digite um nome por linha. As pastas ficam dispon\xedveis imediatamente para upload e movimenta\xe7\xe3o."}
                        </p>,
                         <textarea
                          className={"form-input"}
                          rows={6}
                          placeholder={"Rodada 1\nRodada 2\nP\xf3dio\nCerim\xf4nia de Entrega"}
                          value={newFoldersText}
                          onChange={(e)=>setNewFoldersText(e.target.value)}
                          autoFocus={true}
                          style={{
                                fontFamily: "monospace",
                                fontSize: "0.85rem",
                                resize: "vertical",
                                marginBottom: "0.75rem",
                                width: "100%"
                            }}
                         />,
                        (()=>{
                            const names = newFoldersText.split("\n").map((s)=>s.trim()).filter(Boolean);
                            return  <div
                              style={{
                                    display: "flex",
                                    gap: "0.5rem",
                                    alignItems: "center"
                                }}
                            >
                              {[
                                     <button
                                      className={"btn btn-primary btn-sm"}
                                      disabled={names.length === 0}
                                      onClick={()=>{
                                            if (names.length > 0) {
                                                setExtraFolders((prev)=>{
                                                    const existing = new Set([
                                                        ...prev,
                                                        ...photos.filter((p)=>!p.removida).map((p)=>p.pasta).filter(Boolean)
                                                    ]);
                                                    return [
                                                        ...prev,
                                                        ...names.filter((n)=>!existing.has(n))
                                                    ];
                                                });
                                            }
                                            setShowCreateFoldersModal(false);
                                        }}
                                    >
                                      {[
                                            "Criar ",
                                            names.length > 0 ? "".concat(names.length, " pasta").concat(names.length !== 1 ? "s" : "") : ""
                                        ]}
                                    </button>,
                                     <button
                                      className={"btn btn-ghost btn-sm"}
                                      onClick={()=>setShowCreateFoldersModal(false)}
                                    >
                                      {"Cancelar"}
                                    </button>
                                ]}
                            </div>;
                        })()
                    ]}
              </div>}
            </div>,
            coverChoicePhoto &&  <div
              style={{ position: "fixed", inset: 0, zIndex: 9999, background: "rgba(0,0,0,0.75)", display: "flex", alignItems: "center", justifyContent: "center" }}
              onClick={()=>setCoverChoicePhoto(null)}
            >
              { <div
                style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: "var(--radius-lg)", padding: "1.5rem", minWidth: "280px", maxWidth: "380px", width: "100%" }}
                onClick={(e)=>e.stopPropagation()}
              >
                {[
                     <h3
                      style={{
                            marginBottom: "0.5rem",
                            fontSize: "0.95rem"
                        }}
                    >
                      {"Definir como capa de:"}
                    </h3>,
                     <p
                      style={{
                            fontSize: "0.78rem",
                            color: "var(--text-dim)",
                            marginBottom: "1rem"
                        }}
                    >
                      {["Esta foto está na pasta ", <strong>{coverChoicePhoto.pasta}</strong>, ". Deseja usá-la como capa da pasta ou do álbum inteiro?"]}
                    </p>,
                     <div
                      style={{
                            display: "flex",
                            flexDirection: "column",
                            gap: "0.5rem"
                        }}
                    >
                      {[
                             <button
                              className={"btn btn-secondary btn-sm"}
                              onClick={()=>{
                                    const p = coverChoicePhoto;
                                    setCoverChoicePhoto(null);
                                    setCover(p, "pasta");
                                }}
                            >
                              {["📂 Capa da pasta ", <em>{coverChoicePhoto.pasta}</em>]}
                            </button>,
                             <button
                              className={"btn btn-primary btn-sm"}
                              onClick={()=>{
                                    const p = coverChoicePhoto;
                                    setCoverChoicePhoto(null);
                                    setCover(p, "album");
                                }}
                            >
                              {"🖼 Capa do álbum inteiro"}
                            </button>,
                             <button
                              className={"btn btn-ghost btn-sm"}
                              onClick={()=>setCoverChoicePhoto(null)}
                            >
                              {"Cancelar"}
                            </button>
                        ]}
                    </div>
                ]}
              </div>}
            </div>,
            (()=>{
                var _modalPhoto_id;
                const modalPhoto = adminPhotoModalId ? photos.find((p)=>p.id === adminPhotoModalId) : null;
                if (!modalPhoto) return null;
                const isCover = (event === null || event === void 0 ? void 0 : event.coverImage) === modalPhoto.filename;
                const modalCandidates = getPhotoModalDisplayCandidates(modalPhoto);
                const wmSrc = getFirstUrl(modalCandidates);
                return  <div
                  style={{
                        position: "fixed",
                        inset: 0,
                        zIndex: 9999,
                        background: "rgba(0,0,0,0.92)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        padding: "1rem"
                    }}
                  onClick={()=>setAdminPhotoModalId(null)}
                >
                  { <div
                    style={{
                            background: "var(--bg-card)",
                            borderRadius: "var(--radius-lg)",
                            border: "1px solid var(--border)",
                            maxWidth: "860px",
                            width: "100%",
                            maxHeight: "93vh",
                            overflow: "auto"
                        }}
                    onClick={(e)=>e.stopPropagation()}
                  >
                    {[
                             <div
                              style={{
                                    display: "flex",
                                    justifyContent: "space-between",
                                    alignItems: "flex-start",
                                    padding: "0.85rem 1.25rem",
                                    borderBottom: "1px solid var(--border)"
                                }}
                            >
                              {[
                                     <div>
                                      {[
                                             <p
                                              style={{
                                                    fontSize: "0.7rem",
                                                    color: "var(--text-dim)",
                                                    fontFamily: "monospace"
                                                }}
                                            >
                                              {[
                                                    "#",
                                                    modalPhoto.publicId || ((_modalPhoto_id = modalPhoto.id) === null || _modalPhoto_id === void 0 ? void 0 : _modalPhoto_id.slice(0, 8))
                                                ]}
                                            </p>,
                                             <p
                                              style={{
                                                    fontSize: "0.88rem",
                                                    marginTop: "0.1rem",
                                                    overflow: "hidden",
                                                    textOverflow: "ellipsis",
                                                    whiteSpace: "nowrap",
                                                    maxWidth: "420px"
                                                }}
                                            >
                                              {modalPhoto.originalName || modalPhoto.filename}
                                            </p>
                                        ]}
                                    </div>,
                                     <button
                                      onClick={()=>setAdminPhotoModalId(null)}
                                      className={"btn btn-ghost btn-sm"}
                                    >
                                      {"✕"}
                                    </button>
                                ]}
                            </div>,
                             <div
                              style={{
                                    background: "#000",
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    maxHeight: "500px",
                                    overflow: "hidden"
                                }}
                            >
                              { <img
                                src={wmSrc}
                                alt={""}
                                style={{
                                        maxWidth: "100%",
                                        maxHeight: "500px",
                                        objectFit: "contain"
                                    }}
                                onError={(e)=>{
                                        if (!applyNextImageFallback(e.target, modalCandidates)) e.target.style.display = "none";
                                    }}
                               />}
                            </div>,
                             <div
                              style={{
                                    padding: "1rem 1.25rem"
                                }}
                            >
                              {[
                                     <div
                                      style={{
                                            display: "grid",
                                            gridTemplateColumns: "repeat(auto-fill, minmax(155px, 1fr))",
                                            gap: "0.75rem",
                                            marginBottom: "1rem"
                                        }}
                                    >
                                      {[
                                            [
                                                "Pre\xe7o",
                                                modalPhoto.gratis ? "\uD83C\uDF81 Gr\xe1tis" : "R$ ".concat((Number(modalPhoto.price) || 0).toFixed(2).replace(".", ","))
                                            ],
                                            [
                                                "Pasta",
                                                modalPhoto.pasta || "(Raiz)"
                                            ],
                                            [
                                                "Tamanho",
                                                modalPhoto.size ? "".concat((modalPhoto.size / 1048576).toFixed(1), " MB") : "—"
                                            ],
                                            [
                                                "Capturado",
                                                modalPhoto.takenAt ? new Date(modalPhoto.takenAt).toLocaleString("pt-BR") : "—"
                                            ],
                                            [
                                                "Enviado",
                                                modalPhoto.createdAt ? new Date(modalPhoto.createdAt).toLocaleDateString("pt-BR") : "—"
                                            ],
                                            [
                                                "Capa",
                                                isCover ? "⭐ Sim (capa atual)" : "—"
                                            ]
                                        ].map((param)=>{
                                            let [label, val] = param;
                                            return  <div>
                                              {[
                                                     <p
                                                      style={{
                                                            fontSize: "0.65rem",
                                                            color: "var(--text-dim)",
                                                            marginBottom: "0.15rem",
                                                            textTransform: "uppercase",
                                                            letterSpacing: "0.04em"
                                                        }}
                                                    >
                                                      {label}
                                                    </p>,
                                                     <p
                                                      style={{
                                                            fontSize: "0.82rem"
                                                        }}
                                                    >
                                                      {val}
                                                    </p>
                                                ]}
                                            </div>;
                                        })}
                                    </div>,
                                     <div
                                      style={{
                                            display: "flex",
                                            gap: "0.5rem",
                                            flexWrap: "wrap"
                                        }}
                                    >
                                      {[
                                            !isCover &&  <button
                                              className={"btn btn-secondary btn-sm"}
                                              onClick={async ()=>{
                                                    await setCover(modalPhoto);
                                                    setAdminPhotoModalId(null);
                                                }}
                                            >
                                              {"☆ Definir como capa"}
                                            </button>,
                                             <button
                                              className={"btn btn-ghost btn-sm"}
                                              onClick={async ()=>{
                                                    await handleToggleFree(modalPhoto);
                                                }}
                                            >
                                              {[
                                                    "\uD83C\uDF81 ",
                                                    modalPhoto.gratis ? "Remover gratuidade" : "Marcar como gr\xe1tis"
                                                ]}
                                            </button>,
                                             <button
                                              className={"btn btn-ghost btn-sm"}
                                              onClick={()=>{
                                                    const url = "".concat(window.location.origin, "/evento/").concat(eventId, "?foto=").concat(modalPhoto.id);
                                                    navigator.clipboard.writeText(url);
                                                    showMsg("\uD83D\uDD17 Link copiado!");
                                                }}
                                            >
                                              {"\uD83D\uDD17 Copiar link"}
                                            </button>,
                                             <a
                                              href={"/api/photos/".concat(modalPhoto.id, "/download")}
                                              target={"_blank"}
                                              rel={"noreferrer"}
                                              className={"btn btn-ghost btn-sm"}
                                            >
                                              {"⬇ Ver original"}
                                            </a>,
                                             <button
                                              className={"btn btn-ghost btn-sm"}
                                              onClick={()=>setAdminPhotoModalId(null)}
                                              style={{
                                                    marginLeft: "auto"
                                                }}
                                            >
                                              {"Fechar"}
                                            </button>
                                        ]}
                                    </div>
                                ]}
                            </div>
                        ]}
                  </div>}
                </div>;
            })()
        ]}
    </>;
}
// ===================== TAB: RELATÓRIOS =====================
function TabRelatorios(param) {
    let { eventId, photos, pedidos } = param;
    const activePhotos = photos.filter((p)=>!p.removida && !p.orfaoFuncional && !p.ocultarDoAlbum);
    const soldIds = useMemo(()=>{
        const s = new Set();
        pedidos.forEach((p)=>getPedidoItens(p).filter((i)=>i.eventId === eventId).forEach((i)=>{
                const photoId = getPedidoItemPhotoId(i);
                if (photoId) s.add(photoId);
            }));
        return s;
    }, [
        pedidos,
        eventId
    ]);
    const totalFotos = activePhotos.length;
    const totalVendidas = soldIds.size;
    const taxaConversao = totalFotos > 0 ? (totalVendidas / totalFotos * 100).toFixed(1) : "0.0";
    const faturamento = pedidos.reduce((s, p)=>s + getPedidoItens(p).filter((i)=>i.eventId === eventId).reduce((ss, i)=>ss + (Number(i.price) || 0), 0), 0);
    const byFolder = useMemo(()=>{
        const map = {};
        activePhotos.forEach((p)=>{
            const f = p.pasta || "(Raiz)";
            if (!map[f]) map[f] = {
                fotos: 0,
                vendidas: 0,
                faturamento: 0
            };
            map[f].fotos++;
            if (soldIds.has(p.id)) map[f].vendidas++;
        });
        pedidos.forEach((p)=>{
            getPedidoItens(p).filter((i)=>i.eventId === eventId).forEach((item)=>{
                const photo = activePhotos.find((ph)=>ph.id === getPedidoItemPhotoId(item));
                const f = (photo === null || photo === void 0 ? void 0 : photo.pasta) || "(Raiz)";
                if (map[f]) map[f].faturamento += Number(item.price) || 0;
            });
        });
        return Object.entries(map).sort((a, b)=>b[1].faturamento - a[1].faturamento);
    }, [
        activePhotos,
        pedidos,
        soldIds,
        eventId
    ]);
    return  <>
      {[
             <div
              style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                    gap: "1rem",
                    marginBottom: "2rem"
                }}
            >
              {[
                    {
                        label: "Fotos Enviadas",
                        val: totalFotos
                    },
                    {
                        label: "Fotos Vendidas",
                        val: totalVendidas
                    },
                    {
                        label: "Taxa de Convers\xe3o",
                        val: "".concat(taxaConversao, "%")
                    },
                    {
                        label: "Faturamento",
                        val: "R$ ".concat(faturamento.toFixed(2).replace(".", ",")),
                        color: "var(--success)"
                    }
                ].map((s)=> <div
                  className={"stat-card"}
                >
                  {[
                             <p
                              style={{
                                    fontSize: "0.68rem",
                                    color: "var(--text-dim)",
                                    textTransform: "uppercase"
                                }}
                            >
                              {s.label}
                            </p>,
                             <p
                              style={{
                                    fontSize: "1.4rem",
                                    fontWeight: 700,
                                    color: s.color || "var(--text)"
                                }}
                            >
                              {s.val}
                            </p>
                        ]}
                </div>)}
            </div>,
            byFolder.length > 0 &&  <>
              {[
                     <h3
                      style={{
                            fontSize: "0.88rem",
                            fontFamily: "var(--font-heading)",
                            marginBottom: "1rem"
                        }}
                    >
                      {"Por Pasta"}
                    </h3>,
                     <div
                      style={{
                            overflowX: "auto"
                        }}
                    >
                      { <table
                        style={{
                                width: "100%",
                                borderCollapse: "collapse"
                            }}
                      >
                        {[
                                 <thead key="thead">
                                  { <tr
                                    style={{
                                            borderBottom: "1px solid var(--border)"
                                        }}
                                  >
                                    {[
                                             <th
                                              style={thS}
                                            >
                                              {"Pasta"}
                                            </th>,
                                             <th
                                              style={{
                                                    ...thS,
                                                    textAlign: "right"
                                                }}
                                            >
                                              {"Fotos"}
                                            </th>,
                                             <th
                                              style={{
                                                    ...thS,
                                                    textAlign: "right"
                                                }}
                                            >
                                              {"Vendidas"}
                                            </th>,
                                             <th
                                              style={{
                                                    ...thS,
                                                    textAlign: "right"
                                                }}
                                            >
                                              {"Convers\xe3o"}
                                            </th>,
                                             <th
                                              style={{
                                                    ...thS,
                                                    textAlign: "right"
                                                }}
                                            >
                                              {"Faturamento"}
                                            </th>
                                        ]}
                                  </tr>}
                                </thead>,
                                 <tbody key="tbody">
                                  {byFolder.map((param)=>{
                                        let [folder, data] = param;
                                        return  <tr
                                          style={{
                                                borderBottom: "1px solid var(--border-subtle, rgba(255,255,255,0.05))"
                                            }}
                                        >
                                          {[
                                                 <td
                                                  style={tdS}
                                                >
                                                  {[
                                                        "\uD83D\uDCC2 ",
                                                        folder
                                                    ]}
                                                </td>,
                                                 <td
                                                  style={{
                                                        ...tdS,
                                                        textAlign: "right"
                                                    }}
                                                >
                                                  {data.fotos}
                                                </td>,
                                                 <td
                                                  style={{
                                                        ...tdS,
                                                        textAlign: "right"
                                                    }}
                                                >
                                                  {data.vendidas}
                                                </td>,
                                                 <td
                                                  style={{
                                                        ...tdS,
                                                        textAlign: "right"
                                                    }}
                                                >
                                                  {[
                                                        data.fotos > 0 ? (data.vendidas / data.fotos * 100).toFixed(1) : "0.0",
                                                        "%"
                                                    ]}
                                                </td>,
                                                 <td
                                                  style={{
                                                        ...tdS,
                                                        textAlign: "right",
                                                        color: "var(--success)"
                                                    }}
                                                >
                                                  {[
                                                        "R$ ",
                                                        data.faturamento.toFixed(2).replace(".", ",")
                                                    ]}
                                                </td>
                                            ]}
                                        </tr>;
                                    })}
                                </tbody>
                            ]}
                      </table>}
                    </div>
                ]}
            </>
        ]}
    </>;
}
// ===================== TAB: PREÇOS & DESCONTOS =====================
function TabPrecos(param) {
    let { event, saveEvent, saving, confirm, showToast } = param;
    var _event_precoFotoPadrao;
    const [preco, setPreco] = useState((_event_precoFotoPadrao = event.precoFotoPadrao) !== null && _event_precoFotoPadrao !== void 0 ? _event_precoFotoPadrao : "");
    const [precoVideo, setPrecoVideo] = useState(event.precoVideoPadrao != null ? event.precoVideoPadrao : "");
    const [globalPrice, setGlobalPrice] = useState(null);
    const [globalVideoPrice, setGlobalVideoPrice] = useState(null);
    const [globalDescontos, setGlobalDescontos] = useState([]);
    const [globalDescontosAtivos, setGlobalDescontosAtivos] = useState(false);
    var _event_descontosProgressivosAtivos;
    const [ativo, setAtivo] = useState((_event_descontosProgressivosAtivos = event.descontosProgressivosAtivos) !== null && _event_descontosProgressivosAtivos !== void 0 ? _event_descontosProgressivosAtivos : false);
    const [albumGratis, setAlbumGratis] = useState(!!event.albumGratis);
    const [usarGlobal, setUsarGlobal] = useState(event.usarDescontosGlobais === undefined ? !(event.descontosProgressivos && event.descontosProgressivos.length > 0) : !!event.usarDescontosGlobais);
    const [showSimulator, setShowSimulator] = useState(false);
    const [descontos, setDescontos] = useState(event.descontosProgressivos && event.descontosProgressivos.length > 0 ? event.descontosProgressivos : [
        {
            quantidade: 3,
            desconto: 5
        },
        {
            quantidade: 5,
            desconto: 10
        },
        {
            quantidade: 10,
            desconto: 15
        }
    ]);
    const [photos, setPhotos] = useState([]);
    const [resettingPrices, setResettingPrices] = useState(false);
    const [pricePolicyPrompt, setPricePolicyPrompt] = useState(null);
    const [pricePolicyBusy, setPricePolicyBusy] = useState(false);
    const pendingPriceResetRef = useRef(null);
    useEffect(()=>{
        fetch("/api/config").then((r)=>r.json()).then((cfg)=>{
            if (cfg.precoFotoDefault) setGlobalPrice(Number(cfg.precoFotoDefault));
            if (cfg.precoVideoDefault) setGlobalVideoPrice(Number(cfg.precoVideoDefault));
            setGlobalDescontos(Array.isArray(cfg.descontosGlobais) ? cfg.descontosGlobais : []);
            setGlobalDescontosAtivos(!!cfg.descontosGlobaisAtivos);
        }).catch(()=>{});
        // Load photos to check for price differences
        fetch("/api/photos?eventId=".concat(event.id)).then((r)=>r.json()).then(setPhotos).catch(()=>{});
    }, [
        event.id
    ]);
    // Effective table for simulation: global if toggle on, else event's own
    const effectiveDescontos = usarGlobal ? globalDescontos : descontos;
    const effectiveAtivo = usarGlobal ? globalDescontosAtivos : ativo;
    const usingGlobal = preco === "" || preco === null || preco === undefined;
    const precoBase = usingGlobal ? globalPrice : Number(preco);
    // Detecta fotos com preço diferente do padrão vigente (inclui null/NaN como discrepantes)
    const photosWithDifferentPrices = precoBase != null ? photos.filter((p)=>{
        const pp = Number(p.price);
        return isNaN(pp) || pp !== precoBase;
    }) : [];
    const discrepantCount = photosWithDifferentPrices.length;
    const normalizePriceValue = (value)=>{
        if (value === "" || value === null || value === undefined) return null;
        const numeric = Number(value);
        return Number.isFinite(numeric) ? numeric : null;
    };
    const normalizeDiscounts = (rows)=>rows.filter((d)=>d.quantidade !== "" && d.quantidade !== null && d.desconto !== "" && d.desconto !== null).map((d)=>({
                quantidade: Number(d.quantidade),
                desconto: Number(d.desconto)
            })).filter((d)=>Number.isFinite(d.quantidade) && Number.isFinite(d.desconto)).sort((a, b)=>a.quantidade - b.quantidade);
    const initialPrecosSnapshot = JSON.stringify({
        precoFotoPadrao: normalizePriceValue(event.precoFotoPadrao),
        descontosProgressivosAtivos: !!event.descontosProgressivosAtivos,
        descontosProgressivos: normalizeDiscounts(event.descontosProgressivos || []),
        usarDescontosGlobais: event.usarDescontosGlobais === undefined ? !(event.descontosProgressivos && event.descontosProgressivos.length > 0) : !!event.usarDescontosGlobais,
        albumGratis: !!event.albumGratis
    });
    const currentPrecosSnapshot = JSON.stringify({
        precoFotoPadrao: normalizePriceValue(preco),
        descontosProgressivosAtivos: !!ativo,
        descontosProgressivos: normalizeDiscounts(descontos),
        usarDescontosGlobais: !!usarGlobal,
        albumGratis: !!albumGratis
    });
    const isPrecoDirty = normalizePriceValue(preco) !== normalizePriceValue(event.precoFotoPadrao);
    const isPrecosDirty = currentPrecosSnapshot !== initialPrecosSnapshot;
    function addRow() {
        setDescontos((prev)=>[
                ...prev,
                {
                    quantidade: "",
                    desconto: ""
                }
            ]);
    }
    function removeRow(idx) {
        setDescontos((prev)=>prev.filter((_, i)=>i !== idx));
    }
    function updateRow(idx, field, value) {
        setDescontos((prev)=>prev.map((r, i)=>i === idx ? {
                    ...r,
                    [field]: value
                } : r));
    }
    async function resetAllPrices() {
        if (precoBase == null) return;
        if (discrepantCount === 0) return;
        const accepted = await confirm({
            title: "Redefinir preços discrepantes",
            message: "Redefinir ".concat(discrepantCount, " pre\xe7o(s) discrepante(s) para R$ ").concat(precoBase.toFixed(2).replace(".", ","), "?"),
            confirmText: "Redefinir preços",
            cancelText: "Cancelar"
        });
        if (!accepted) return;
        setResettingPrices(true);
        try {
            const photoIds = photosWithDifferentPrices.map((p)=>p.id);
            const res = await fetch("/api/photos", {
                method: "PATCH",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    ids: photoIds,
                    price: precoBase
                })
            });
            if (res.status === 409) {
                const data = await res.json();
                pendingPriceResetRef.current = {
                    ids: photoIds,
                    price: precoBase
                };
                setPricePolicyPrompt(data.analysis);
                return;
            }
            if (!res.ok) throw new Error("Erro ao redefinir pre\xe7os");
            setPhotos((prev)=>prev.map((p)=>photosWithDifferentPrices.some((pd)=>pd.id === p.id) ? {
                        ...p,
                        price: precoBase
                    } : p));
        } catch (err) {
            if (showToast) showToast("Erro ao redefinir pre\xe7os.");
        } finally{
            setResettingPrices(false);
        }
    }
    async function resolveResetPricePolicy(decision) {
        const pending = pendingPriceResetRef.current;
        if (!pending) return;
        setPricePolicyBusy(true);
        try {
            const res = await fetch("/api/photos", {
                method: "PATCH",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    ids: pending.ids,
                    price: pending.price,
                    cartPriceDecision: decision
                })
            });
            if (!res.ok) throw new Error("Erro ao redefinir preços");
            const idSet = new Set(pending.ids);
            setPhotos((prev)=>prev.map((p)=>idSet.has(p.id) ? {
                        ...p,
                        price: pending.price
                    } : p));
            pendingPriceResetRef.current = null;
            setPricePolicyPrompt(null);
        } catch (err) {
            if (showToast) showToast("Erro ao aplicar política de preço.");
        } finally{
            setPricePolicyBusy(false);
        }
    }
    function handleSave() {
        const validDescontos = descontos.filter((d)=>d.quantidade && d.desconto).map((d)=>({
                quantidade: Number(d.quantidade),
                desconto: Number(d.desconto)
            })).sort((a, b)=>a.quantidade - b.quantidade);
        // Validação: descontos devem ser estritamente crescentes
        for(let i = 1; i < validDescontos.length; i++){
            if (validDescontos[i].desconto <= validDescontos[i - 1].desconto) {
                if (showToast) showToast("Erro: desconto de ".concat(validDescontos[i].quantidade, " fotos deve ser maior que o de ").concat(validDescontos[i - 1].quantidade, " fotos."));
                return;
            }
        }
        saveEvent({
            precoFotoPadrao: preco ? Number(String(preco).replace(",", ".")) : null,
            descontosProgressivos: validDescontos,
            descontosProgressivosAtivos: ativo,
            usarDescontosGlobais: usarGlobal,
            albumGratis
        });
    }
    return  <div
      style={{
            maxWidth: "620px"
        }}
    >
      {[
             pricePolicyPrompt &&  <CartPricePolicyModal
              analysis={pricePolicyPrompt}
              busy={pricePolicyBusy}
              onCancel={()=>{
                    pendingPriceResetRef.current = null;
                    setPricePolicyPrompt(null);
                }}
              onConfirm={resolveResetPricePolicy}
            />,
             <div
              className={"form-group"}
            >
              {[
                     <label
                      className={"form-label"}
                    >
                      {"Pre\xe7o padr\xe3o por foto neste evento (R$)"}
                    </label>,
                     <div
                      style={{
                            display: "flex",
                            gap: "0.5rem",
                            alignItems: "center"
                        }}
                    >
                      {[
                             <input
                              type={"text"}
                              inputMode={"decimal"}
                              className={"form-input"}
                              value={preco}
                              onChange={(e)=>setPreco(e.target.value.replace(",", "."))}
                              placeholder={globalPrice ? "Vazio = global (R$ ".concat(globalPrice.toFixed(2).replace(".", ","), ")") : "Ex: 20,00 (vazio = usar pre\xe7o global)"}
                              style={{
                                    flex: 1
                                }}
                             />,
                             <button
                              className={"btn btn-sm ".concat(isPrecoDirty ? "btn-state-dirty" : "btn-state-clean")}
                              onClick={()=>saveEvent({
                                        precoFotoPadrao: preco ? Number(String(preco).replace(",", ".")) : null
                                    })}
                              disabled={saving || !isPrecoDirty}
                              style={{
                                    whiteSpace: "nowrap"
                                }}
                            >
                              {saving ? "..." : "Definir"}
                            </button>
                        ]}
                    </div>,
                    usingGlobal && globalPrice != null ?  <p
                      style={{
                            fontSize: "0.75rem",
                            color: "var(--accent)",
                            marginTop: "0.35rem",
                            display: "flex",
                            alignItems: "center",
                            gap: "0.3rem"
                        }}
                    >
                      {[
                             <span>
                              {"\uD83C\uDF10"}
                            </span>,
                             <span>
                              {[
                                    "Usando pre\xe7o global: ",
                                     <strong>
                                      {[
                                            "R$ ",
                                            globalPrice.toFixed(2).replace(".", ",")
                                        ]}
                                    </strong>,
                                    " por foto"
                                ]}
                            </span>
                        ]}
                    </p> :  <p
                      style={{
                            fontSize: "0.72rem",
                            color: "var(--text-dim)",
                            marginTop: "0.25rem"
                        }}
                    >
                      {"Deixe vazio para usar o pre\xe7o global definido nas configura\xe7\xf5es."}
                    </p>,
                    preco && Number(String(preco).replace(",", ".")) > 0 && Number(String(preco).replace(",", ".")) < 5 &&  <p
                      style={{
                            fontSize: "0.75rem",
                            color: "var(--accent)",
                            marginTop: "0.25rem",
                            display: "flex",
                            alignItems: "center",
                            gap: "0.3rem"
                        }}
                    >
                      {"⚠️ Preços abaixo de R$ 5,00 podem não cobrir as taxas de pagamento do gateway."}
                    </p>,
                    photos.length > 0 && precoBase != null &&  <button
                      className={"btn btn-sm ".concat(discrepantCount > 0 ? "btn-secondary" : "btn-ghost")}
                      onClick={resetAllPrices}
                      disabled={resettingPrices || discrepantCount === 0}
                      style={{
                            marginTop: "0.75rem",
                            opacity: discrepantCount === 0 ? 0.5 : 1
                        }}
                    >
                      {resettingPrices ? "Redefinindo..." : discrepantCount > 0 ? "\uD83D\uDD04 Redefinir ".concat(discrepantCount, " pre\xe7o").concat(discrepantCount !== 1 ? "s" : "", " discrepante").concat(discrepantCount !== 1 ? "s" : "") : "✓ Todos os pre\xe7os est\xe3o padronizados"}
                    </button>
                ]}
            </div>,
            // ─── Preço por vídeo ──────────────────────────────────────
            <div key="preco-video" className="form-group">
              <label className="form-label">🎬 Preço padrão por vídeo neste evento (R$)</label>
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                <input
                  type="text"
                  inputMode="decimal"
                  className="form-input"
                  value={precoVideo}
                  onChange={(e) => setPrecoVideo(e.target.value.replace(',', '.'))}
                  placeholder={globalVideoPrice ? ('Vazio = global (R$ ' + globalVideoPrice.toFixed(2).replace('.', ',') + ')') : 'Ex: 50,00 (vazio = usar preço global)'}
                  style={{ flex: 1 }}
                />
                <button
                  className={'btn btn-sm ' + (String(precoVideo) !== String(event.precoVideoPadrao ?? '') ? 'btn-state-dirty' : 'btn-state-clean')}
                  onClick={() => saveEvent({ precoVideoPadrao: precoVideo === '' || precoVideo == null ? null : Number(String(precoVideo).replace(',', '.')) })}
                  disabled={saving || String(precoVideo) === String(event.precoVideoPadrao ?? '')}
                  style={{ whiteSpace: 'nowrap' }}
                >
                  {saving ? '...' : 'Definir'}
                </button>
              </div>
              <p style={{ fontSize: '0.72rem', color: 'var(--text-dim)', marginTop: '0.25rem' }}>
                Aplicado a novos vídeos. Vídeos existentes mantêm o preço atual até serem editados manualmente.
              </p>
            </div>,
             <div
              className={"form-group"}
              style={{
                    marginTop: "0.75rem"
                }}
            >
              {[
                     <label
                      className={"form-label"}
                    >
                      {"Álbum gratuito"}
                    </label>,
                     <div
                      style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "0.5rem"
                        }}
                    >
                      {[
                             <input
                              type={"checkbox"}
                              checked={albumGratis}
                              onChange={(e)=>setAlbumGratis(e.target.checked)}
                              style={{
                                    width: "18px",
                                    height: "18px",
                                    accentColor: "var(--accent)"
                                }}
                             />,
                             <span
                              style={{
                                    fontSize: "0.9rem",
                                    color: "var(--text)"
                                }}
                            >
                              {"Marcar todas as fotos como gratuitas para o cliente"}
                            </span>
                        ]}
                    </div>,
                     <p
                      style={{
                            fontSize: "0.75rem",
                            color: "var(--text-muted)",
                            marginTop: "0.35rem",
                            lineHeight: 1.45
                        }}
                    >
                      {"Sobrepõe preços individuais para o cliente, mas não altera os valores armazenados. Ao desativar, os preços existentes voltam a valer."}
                    </p>
                ]}
            </div>,
             <hr
              className={"divider"}
             />,
             <div
              style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    marginBottom: "0.4rem",
                    gap: "0.5rem",
                    flexWrap: "wrap"
                }}
            >
              {[
                     <h3
                      style={{
                            fontSize: "0.92rem",
                            fontFamily: "var(--font-heading)",
                            margin: 0
                        }}
                    >
                      {"Descontos Progressivos"}
                    </h3>,
                    !usarGlobal &&  <button
                      onClick={()=>setAtivo((v)=>!v)}
                      style={{
                            padding: "0.3rem 0.9rem",
                            borderRadius: "100px",
                            border: "none",
                            cursor: "pointer",
                            fontSize: "0.75rem",
                            fontWeight: 600,
                            background: ativo ? "var(--success)" : "var(--bg-input)",
                            color: ativo ? "#fff" : "var(--text-dim)",
                            transition: "all 0.2s"
                        }}
                    >
                      {ativo ? "● Ativo" : "○ Inativo"}
                    </button>
                ]}
            </div>,
             <div
              style={{
                    display: "flex",
                    gap: "0.5rem",
                    alignItems: "center",
                    background: "var(--bg-input)",
                    border: "1px solid var(--border)",
                    borderRadius: "var(--radius)",
                    padding: "0.5rem 0.75rem",
                    marginBottom: "0.75rem",
                    flexWrap: "wrap"
                }}
            >
              {[
                     <span
                      style={{
                            fontSize: "0.78rem",
                            color: "var(--text-muted)",
                            fontWeight: 500
                        }}
                    >
                      {"Origem dos descontos:"}
                    </span>,
                     <button
                      type={"button"}
                      onClick={()=>setUsarGlobal(true)}
                      style={{
                            padding: "0.25rem 0.7rem",
                            borderRadius: "100px",
                            border: "1px solid " + (usarGlobal ? "var(--accent)" : "var(--border)"),
                            background: usarGlobal ? "rgba(201,169,110,0.18)" : "transparent",
                            color: usarGlobal ? "var(--accent)" : "var(--text-dim)",
                            cursor: "pointer",
                            fontSize: "0.75rem",
                            fontWeight: 600
                        }}
                    >
                      {"🌐 Global"}
                    </button>,
                     <button
                      type={"button"}
                      onClick={()=>setUsarGlobal(false)}
                      style={{
                            padding: "0.25rem 0.7rem",
                            borderRadius: "100px",
                            border: "1px solid " + (!usarGlobal ? "var(--accent)" : "var(--border)"),
                            background: !usarGlobal ? "rgba(201,169,110,0.18)" : "transparent",
                            color: !usarGlobal ? "var(--accent)" : "var(--text-dim)",
                            cursor: "pointer",
                            fontSize: "0.75rem",
                            fontWeight: 600
                        }}
                    >
                      {"🎯 Personalizado"}
                    </button>,
                    usarGlobal &&  <span
                      style={{
                            fontSize: "0.72rem",
                            color: "var(--text-dim)"
                        }}
                    >
                      {globalDescontosAtivos && globalDescontos.length > 0 ? "Usando tabela das configurações." : "Sem tabela global ativa — sem desconto."}
                    </span>
                ]}
            </div>,
             <p
              style={{
                    fontSize: "0.78rem",
                    color: "var(--text-dim)",
                    marginBottom: "1rem",
                    marginTop: "0.3rem"
                }}
            >
              {[
                    ativo ? "Descontos ativos — os cards de promo\xe7\xe3o aparecer\xe3o na p\xe1gina do evento." : "Descontos inativos — configure abaixo e ative quando estiver pronto.",
                    precoBase != null && " Valor calculado sobre o pre\xe7o padr\xe3o do evento."
                ]}
            </p>,
            !usarGlobal &&  <div
              style={{
                    marginBottom: "1rem"
                }}
            >
              {[
                    descontos.map((row, i)=>{
                        const resultante = precoBase != null && row.desconto ? precoBase * (1 - Number(row.desconto) / 100) : null;
                        // Detecta erro: desconto desta linha <= linha anterior (com valores válidos)
                        const prevValid = descontos.slice(0, i).filter((d)=>d.quantidade && d.desconto).map((d)=>({
                                quantidade: Number(d.quantidade),
                                desconto: Number(d.desconto)
                            })).sort((a, b)=>a.quantidade - b.quantidade);
                        const incoherentSet = detectIncoherentTiers({ precoBase: precoBase || 0, tabela: descontos, ativos: true });
                        const isIncoherent = incoherentSet.has(i);
                        const hasError = (row.quantidade && row.desconto && prevValid.length > 0 && prevValid.some((p)=>p.quantidade < Number(row.quantidade) && p.desconto >= Number(row.desconto))) || isIncoherent;
                        return  <div
                          style={{
                                display: "flex",
                                gap: "0.75rem",
                                alignItems: "flex-end",
                                marginBottom: "0.6rem",
                                flexWrap: "wrap"
                            }}
                        >
                          {[
                                 <div
                                  style={{
                                        flex: "0 0 100px"
                                    }}
                                >
                                  {[
                                        i === 0 &&  <label
                                          style={{
                                                fontSize: "0.72rem",
                                                color: "var(--text-dim)",
                                                display: "block",
                                                marginBottom: "0.25rem"
                                            }}
                                        >
                                          {"A partir de (fotos)"}
                                        </label>,
                                         <input
                                          type={"number"}
                                          className={"form-input"}
                                          placeholder={"Qtd"}
                                          min={"1"}
                                          value={row.quantidade}
                                          onChange={(e)=>updateRow(i, "quantidade", e.target.value)}
                                          style={hasError ? {
                                                borderColor: "var(--danger)"
                                            } : {}}
                                         />
                                    ]}
                                </div>,
                                 <div
                                  style={{
                                        flex: "0 0 90px"
                                    }}
                                >
                                  {[
                                        i === 0 &&  <label
                                          style={{
                                                fontSize: "0.72rem",
                                                color: "var(--text-dim)",
                                                display: "block",
                                                marginBottom: "0.25rem"
                                            }}
                                        >
                                          {"Desconto (%)"}
                                        </label>,
                                         <input
                                          type={"number"}
                                          className={"form-input"}
                                          placeholder={"%"}
                                          min={"0"}
                                          max={"100"}
                                          value={row.desconto}
                                          onChange={(e)=>updateRow(i, "desconto", e.target.value)}
                                          style={hasError ? {
                                                borderColor: "var(--danger)"
                                            } : {}}
                                         />
                                    ]}
                                </div>,
                                resultante != null &&  <div
                                  style={{
                                        flex: 1,
                                        minWidth: "120px"
                                    }}
                                >
                                  {[
                                        i === 0 &&  <div
                                          style={{
                                                fontSize: "0.72rem",
                                                color: "var(--text-dim)",
                                                marginBottom: "0.25rem"
                                            }}
                                        >
                                          {"Valor resultante"}
                                        </div>,
                                         <div
                                          style={{
                                                padding: "0.55rem 0.75rem",
                                                background: "var(--bg-input)",
                                                border: "1px solid ".concat(hasError ? "var(--danger)" : "var(--border)"),
                                                borderRadius: "var(--radius)",
                                                fontSize: "0.82rem",
                                                color: hasError ? "var(--danger)" : "var(--accent)",
                                                fontWeight: 600
                                            }}
                                        >
                                          {[
                                                hasError ? "⚠️ desconto menor" : "R$ ".concat(resultante.toFixed(2).replace(".", ","), " / foto"),
                                                !hasError && !usingGlobal ? "" : !hasError ?  <span
                                                  style={{
                                                        fontSize: "0.65rem",
                                                        color: "var(--text-dim)",
                                                        fontWeight: 400,
                                                        marginLeft: "0.3rem"
                                                    }}
                                                >
                                                  {"(global)"}
                                                </span> : null
                                            ]}
                                        </div>
                                    ]}
                                </div>,
                                precoBase == null && row.desconto &&  <div
                                  style={{
                                        flex: 1
                                    }}
                                >
                                  {[
                                        i === 0 &&  <div
                                          style={{
                                                fontSize: "0.72rem",
                                                color: "var(--text-dim)",
                                                marginBottom: "0.25rem"
                                            }}
                                        >
                                          {"Obs."}
                                        </div>,
                                         <div
                                          style={{
                                                fontSize: "0.72rem",
                                                color: "var(--text-dim)",
                                                padding: "0.55rem 0"
                                            }}
                                        >
                                          {"Defina o pre\xe7o padr\xe3o para ver o valor calculado"}
                                        </div>
                                    ]}
                                </div>,
                                 <button
                                  className={"btn btn-ghost btn-sm"}
                                  onClick={()=>removeRow(i)}
                                  title={"Remover"}
                                  style={{
                                        color: "var(--danger)",
                                        flexShrink: 0
                                    }}
                                >
                                  {"\uD83D\uDDD1"}
                                </button>
                            ]}
                        </div>;
                    }),
                    descontos.length < 10 &&  <button
                      className={"btn btn-ghost btn-sm"}
                      onClick={addRow}
                    >
                      {"+ Adicionar faixa"}
                    </button>,
                    descontos.length >= 10 &&  <p
                      style={{
                            fontSize: "0.72rem",
                            color: "var(--text-dim)"
                        }}
                    >
                      {"M\xe1ximo de 10 faixas atingido."}
                    </p>
                ]}
            </div>,
            usarGlobal && globalDescontos.length > 0 &&  <div
              style={{
                    background: "rgba(201,169,110,0.07)",
                    border: "1px solid rgba(201,169,110,0.2)",
                    borderRadius: "var(--radius)",
                    padding: "0.75rem 1rem",
                    marginBottom: "1rem",
                    fontSize: "0.78rem",
                    color: "var(--text-dim)"
                }}
            >
              {[
                     <p
                      style={{
                            marginBottom: "0.4rem",
                            fontWeight: 600,
                            color: "var(--text-muted)"
                        }}
                    >
                      {[globalDescontosAtivos ? "🌐 " : "🚫 ", "Tabela global", globalDescontosAtivos ? " (ativa):" : " (inativa nas configurações):"]}
                    </p>,
                    [...globalDescontos].sort((a, b)=>Number(a.quantidade) - Number(b.quantidade)).map((d, i)=> <p
                      key={i}
                      style={{
                                fontSize: "0.78rem",
                                marginBottom: "0.15rem"
                            }}
                    >
                      {["• A partir de ", Number(d.quantidade), " fotos: ", Number(d.desconto), "% de desconto", precoBase != null && " — R$ " + (precoBase * (1 - Number(d.desconto) / 100)).toFixed(2).replace(".", ",") + " / foto"]}
                    </p>)
                ]}
            </div>,
            precoBase != null && (effectiveDescontos || []).some((d)=>d.quantidade && d.desconto) &&  <div
              style={{
                    background: "rgba(201,169,110,0.07)",
                    border: "1px solid rgba(201,169,110,0.2)",
                    borderRadius: "var(--radius)",
                    padding: "0.75rem 1rem",
                    marginBottom: "1rem",
                    fontSize: "0.78rem",
                    color: "var(--text-dim)"
                }}
            >
              {[
                     <strong
                      style={{
                            color: "var(--text-muted)"
                        }}
                    >
                      {"Resumo:"}
                    </strong>,
                    " os descontos acima incidem sobre cada foto, inclusive as com preço individual diferente do padrão. Fotos gratuitas continuam grátis e não contam para a faixa."
                ]}
            </div>,
             <div
              style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    marginBottom: "0.5rem"
                }}
            >
              {[
                     <button
                      type={"button"}
                      className={"btn btn-ghost btn-sm"}
                      onClick={()=>setShowSimulator((v)=>!v)}
                    >
                      {showSimulator ? "▾ Esconder simulador" : "▸ Simular 1–40 fotos"}
                    </button>,
                    precoBase == null &&  <span
                      style={{
                            fontSize: "0.7rem",
                            color: "var(--text-dim)"
                        }}
                    >
                      {"Defina o preço padrão para simular."}
                    </span>
                ]}
            </div>,
            showSimulator && precoBase != null &&  <div
              style={{
                    overflowX: "auto",
                    border: "1px solid var(--border)",
                    borderRadius: "var(--radius)",
                    marginBottom: "1rem"
                }}
            >
              { <table
                style={{
                        width: "100%",
                        borderCollapse: "collapse",
                        fontSize: "0.78rem"
                    }}
              >
                {[
                         <thead key="thead">
                          { <tr
                            style={{
                                    background: "var(--bg-input)"
                                }}
                          >
                            {[
                                     <th
                                      style={{
                                            padding: "0.4rem 0.6rem",
                                            textAlign: "left",
                                            color: "var(--text-dim)"
                                        }}
                                    >
                                      {"Qtd"}
                                    </th>,
                                     <th
                                      style={{
                                            padding: "0.4rem 0.6rem",
                                            textAlign: "right",
                                            color: "var(--text-dim)"
                                        }}
                                    >
                                      {"Desconto"}
                                    </th>,
                                     <th
                                      style={{
                                            padding: "0.4rem 0.6rem",
                                            textAlign: "right",
                                            color: "var(--text-dim)"
                                        }}
                                    >
                                      {"Valor / foto"}
                                    </th>,
                                     <th
                                      style={{
                                            padding: "0.4rem 0.6rem",
                                            textAlign: "right",
                                            color: "var(--text-dim)"
                                        }}
                                    >
                                      {"Total"}
                                    </th>
                                ]}
                          </tr>}
                        </thead>,
                         <tbody key="tbody">
                          {simulateProgressiveTable({ precoBase, tabela: effectiveDescontos, ativos: effectiveAtivo }).map((r)=> <tr
                            key={r.qty}
                            style={{
                                        borderTop: "1px solid var(--border)",
                                        background: r.warn ? "rgba(220,38,38,0.08)" : "transparent"
                                    }}
                          >
                            {[
                                         <td
                                          style={{
                                                padding: "0.35rem 0.6rem"
                                            }}
                                        >
                                          {r.qty}
                                        </td>,
                                         <td
                                          style={{
                                                padding: "0.35rem 0.6rem",
                                                textAlign: "right",
                                                color: r.pct > 0 ? "var(--accent)" : "var(--text-dim)"
                                            }}
                                        >
                                          {r.pct > 0 ? r.pct + "%" : "—"}
                                        </td>,
                                         <td
                                          style={{
                                                padding: "0.35rem 0.6rem",
                                                textAlign: "right"
                                            }}
                                        >
                                          {"R$ " + r.unit.toFixed(2).replace(".", ",")}
                                        </td>,
                                         <td
                                          style={{
                                                padding: "0.35rem 0.6rem",
                                                textAlign: "right",
                                                fontWeight: 600
                                            }}
                                        >
                                          {["R$ " + r.total.toFixed(2).replace(".", ","), r.warn &&  <span
                                            title={"Faixa incoerente"}
                                            style={{
                                                        marginLeft: "0.3rem",
                                                        color: "var(--danger)"
                                                    }}
                                          >
                                            {"⚠️"}
                                          </span>]}
                                        </td>
                                    ]}
                          </tr>)}
                        </tbody>
                    ]}
              </table>}
            </div>,
             <button
              className={"btn ".concat(isPrecosDirty ? "btn-state-dirty" : "btn-state-clean")}
              onClick={handleSave}
              disabled={saving || !isPrecosDirty}
            >
              {saving ? "Salvando..." : "Salvar Pre\xe7os & Descontos"}
            </button>,
            // Bloco separado de descontos progressivos para vídeos
            <TabPrecosVideo
              key="tab-precos-video"
              event={event}
              saveEvent={saveEvent}
              saving={saving}
              showToast={showToast}
            />
        ]}
    </div>;
}
// ===================== TAB: INFORMAÇÕES =====================
function TabInfo(param) {
    let { event, saveEvent, saving, confirm, showToast } = param;
    const initialState = {
        name: event.name || "",
        date: event.date || "",
        dataFinal: event.dataFinal || "",
        description: event.description || "",
        visibilidade: event.visibilidade || "publico",
        categoria: event.categoria || "",
        horarioInicial: event.horarioInicial || "",
        horarioFinal: event.horarioFinal || "",
        cidade: event.cidade || "",
        estado: event.estado || "",
        localEspecifico: event.localEspecifico || "",
        organizador: event.organizador || "",
        capaPersonalizadaUrl: event.capaPersonalizadaUrl || "",
        usarCapaPersonalizada: event.usarCapaPersonalizada || false,
        patrocinadores: Array.isArray(event.patrocinadores) ? event.patrocinadores : []
    };
    const [form, setForm] = useState(initialState);
    const normalizeInfoPayload = (data)=>({
            name: (data.name || "").trim(),
            date: data.date || "",
            dataFinal: data.dataFinal || "",
            description: (data.description || "").trim(),
            visibilidade: data.visibilidade || "publico",
            categoria: data.categoria || "",
            horarioInicial: data.horarioInicial || "",
            horarioFinal: data.horarioFinal || "",
            cidade: (data.cidade || "").trim(),
            estado: data.estado || "",
            localEspecifico: (data.localEspecifico || "").trim(),
            organizador: (data.organizador || "").trim(),
            capaPersonalizadaUrl: (data.capaPersonalizadaUrl || "").trim(),
            usarCapaPersonalizada: !!data.usarCapaPersonalizada,
            patrocinadores: (data.patrocinadores || []).filter((p)=>(p.nome || "").trim()).map((p)=>({ nome: p.nome.trim(), link: (p.link || "").trim() || null }))
        });
    const initialInfoSnapshot = JSON.stringify(normalizeInfoPayload(initialState));
    const currentInfoSnapshot = JSON.stringify(normalizeInfoPayload(form));
    const isDirty = currentInfoSnapshot !== initialInfoSnapshot;
    // Warn before leaving with unsaved changes
    useEffect(()=>{
        if (!isDirty) return;
        function onBeforeUnload(e) {
            e.preventDefault();
            e.returnValue = "";
        }
        window.addEventListener("beforeunload", onBeforeUnload);
        return ()=>window.removeEventListener("beforeunload", onBeforeUnload);
    }, [
        isDirty
    ]);
    function handleChange(field, value) {
        setForm((prev)=>({
                ...prev,
                [field]: value
            }));
    }
    function handleSave() {
        if (!form.name.trim() || !form.date) {
            if (showToast) showToast("Nome e data s\xe3o obrigat\xf3rios.");
            return;
        }
        saveEvent({
            name: form.name.trim(),
            date: form.date,
            dataFinal: form.dataFinal || null,
            description: form.description.trim(),
            visibilidade: form.visibilidade,
            categoria: form.categoria || null,
            horarioInicial: form.horarioInicial || null,
            horarioFinal: form.horarioFinal || null,
            cidade: form.cidade.trim() || null,
            estado: form.estado || null,
            localEspecifico: form.localEspecifico.trim() || null,
            organizador: form.organizador.trim() || null,
            capaPersonalizadaUrl: form.capaPersonalizadaUrl.trim() || null,
            usarCapaPersonalizada: form.usarCapaPersonalizada,
            patrocinadores: (form.patrocinadores || []).filter((p)=>(p.nome || "").trim()).map((p)=>({ nome: p.nome.trim(), link: (p.link || "").trim() || null }))
        });
    }
    return  <div
      style={{
            maxWidth: "700px"
        }}
    >
      {[
            isDirty &&  <div
              style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "0.75rem",
                    padding: "0.6rem 1rem",
                    marginBottom: "1rem",
                    background: "rgba(245,158,11,0.1)",
                    border: "1px solid rgba(245,158,11,0.3)",
                    borderRadius: "var(--radius)",
                    fontSize: "0.82rem",
                    color: "#f59e0b"
                }}
            >
              {[
                     <span>
                      {"⚠️"}
                    </span>,
                     <span>
                      {"H\xe1 altera\xe7\xf5es n\xe3o salvas."}
                    </span>,
                     <button
                      className={"btn btn-sm ".concat(isDirty ? "btn-state-dirty" : "btn-state-clean")}
                      style={{
                            marginLeft: "auto"
                        }}
                      onClick={handleSave}
                      disabled={saving || !isDirty}
                    >
                      {saving ? "Salvando..." : "Salvar agora"}
                    </button>
                ]}
            </div>,
             <div
              className={"form-group"}
            >
              {[
                     <label
                      className={"form-label"}
                    >
                      {"Nome do Evento *"}
                    </label>,
                     <input
                      type={"text"}
                      className={"form-input"}
                      value={form.name}
                      onChange={(e)=>handleChange("name", e.target.value)}
                     />
                ]}
            </div>,
             <div
              className={"form-group"}
            >
              {[
                     <label
                      className={"form-label"}
                    >
                      {"Descri\xe7\xe3o"}
                    </label>,
                     <textarea
                      className={"form-textarea"}
                      rows={3}
                      value={form.description}
                      onChange={(e)=>handleChange("description", e.target.value)}
                     />
                ]}
            </div>,
             <div
              style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    gap: "1rem"
                }}
            >
              {[
                     <div
                      className={"form-group"}
                    >
                      {[
                             <label
                              className={"form-label"}
                            >
                              {"Data In\xedcio *"}
                            </label>,
                             <div
                              style={{
                                    display: "flex",
                                    gap: "0.4rem",
                                    alignItems: "center"
                                }}
                            >
                              {[
                                     <input
                                      type={"date"}
                                      className={"form-input"}
                                      value={form.date}
                                      onChange={(e)=>handleChange("date", e.target.value)}
                                      style={{
                                            flex: 1
                                        }}
                                     />,
                                     <button
                                      type={"button"}
                                      className={"btn btn-ghost btn-sm"}
                                      style={{
                                            whiteSpace: "nowrap",
                                            flexShrink: 0
                                        }}
                                      onClick={()=>handleChange("date", new Date().toISOString().slice(0, 10))}
                                    >
                                      {"Hoje"}
                                    </button>
                                ]}
                            </div>
                        ]}
                    </div>,
                     <div
                      className={"form-group"}
                    >
                      {[
                             <label
                              className={"form-label"}
                            >
                              {"Data T\xe9rmino"}
                            </label>,
                             <input
                              type={"date"}
                              className={"form-input"}
                              value={form.dataFinal}
                              onChange={(e)=>handleChange("dataFinal", e.target.value)}
                             />
                        ]}
                    </div>
                ]}
            </div>,
             <div
              style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    gap: "1rem"
                }}
            >
              {[
                     <div
                      className={"form-group"}
                    >
                      {[
                             <label
                              className={"form-label"}
                            >
                              {"Hor\xe1rio In\xedcio"}
                            </label>,
                             <input
                              type={"time"}
                              className={"form-input"}
                              value={form.horarioInicial}
                              onChange={(e)=>handleChange("horarioInicial", e.target.value)}
                             />
                        ]}
                    </div>,
                     <div
                      className={"form-group"}
                    >
                      {[
                             <label
                              className={"form-label"}
                            >
                              {"Hor\xe1rio T\xe9rmino"}
                            </label>,
                             <input
                              type={"time"}
                              className={"form-input"}
                              value={form.horarioFinal}
                              onChange={(e)=>handleChange("horarioFinal", e.target.value)}
                             />
                        ]}
                    </div>
                ]}
            </div>,
             <hr
              className={"divider"}
             />,
             <div
              className={"form-group"}
            >
              {[
                     <label
                      className={"form-label"}
                    >
                      {"Categoria / Modalidade"}
                    </label>,
                     <select
                      className={"form-input"}
                      value={form.categoria}
                      onChange={(e)=>handleChange("categoria", e.target.value)}
                    >
                      {[
                             <option
                              value={""}
                            >
                              {"Selecionar categoria..."}
                            </option>,
                            CATEGORIAS.map((c)=> <option
                              value={c}
                            >
                              {c}
                            </option>)
                        ]}
                    </select>
                ]}
            </div>,
             <div
              className={"form-group"}
            >
              {[
                     <label
                      className={"form-label"}
                    >
                      {"Visibilidade"}
                    </label>,
                     <select
                      className={"form-input"}
                      value={form.visibilidade}
                      onChange={(e)=>handleChange("visibilidade", e.target.value)}
                    >
                      {[
                             <option
                              value={"publico"}
                            >
                              {"P\xfablico — vis\xedvel na home e buscas"}
                            </option>,
                             <option
                              value={"naolistado"}
                            >
                              {"N\xe3o listado — acess\xedvel apenas por link"}
                            </option>,
                             <option
                              value={"privado"}
                            >
                              {"Privado — somente admin"}
                            </option>
                        ]}
                    </select>
                ]}
            </div>,
             <hr
              className={"divider"}
             />,
             <div
              style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    gap: "1rem"
                }}
            >
              {[
                     <div
                      className={"form-group"}
                    >
                      {[
                             <label
                              className={"form-label"}
                            >
                              {"Cidade"}
                            </label>,
                             <input
                              type={"text"}
                              className={"form-input"}
                              placeholder={"Ex: S\xe3o Paulo"}
                              value={form.cidade}
                              onChange={(e)=>handleChange("cidade", e.target.value)}
                             />
                        ]}
                    </div>,
                     <div
                      className={"form-group"}
                    >
                      {[
                             <label
                              className={"form-label"}
                            >
                              {"Estado"}
                            </label>,
                             <select
                              className={"form-input"}
                              value={form.estado}
                              onChange={(e)=>handleChange("estado", e.target.value)}
                            >
                              {[
                                     <option
                                      value={""}
                                    >
                                      {"Selecionar..."}
                                    </option>,
                                    ESTADOS_BR.map((uf)=> <option
                                      value={uf}
                                    >
                                      {uf}
                                    </option>)
                                ]}
                            </select>
                        ]}
                    </div>
                ]}
            </div>,
             <div
              className={"form-group"}
            >
              {[
                     <label
                      className={"form-label"}
                    >
                      {"Local Espec\xedfico"}
                    </label>,
                     <input
                      type={"text"}
                      className={"form-input"}
                      placeholder={"Ex: Arena Corinthians, Quadra 3..."}
                      value={form.localEspecifico}
                      onChange={(e)=>handleChange("localEspecifico", e.target.value)}
                     />
                ]}
            </div>,
             <div
              className={"form-group"}
            >
              {[
                     <label
                      className={"form-label"}
                    >
                      {"Organizador"}
                    </label>,
                     <input
                      type={"text"}
                      className={"form-input"}
                      placeholder={"Nome do organizador"}
                      value={form.organizador}
                      onChange={(e)=>handleChange("organizador", e.target.value)}
                     />
                ]}
            </div>,
             // ─── Patrocinadores: agora gerenciados na aba "Patrocinadores" ───
             <div
              key="patrocinadores-info"
              style={{
                    padding: "0.65rem 0.85rem",
                    background: "var(--bg-secondary)",
                    border: "1px dashed var(--border)",
                    borderRadius: "var(--radius)",
                    fontSize: "0.78rem",
                    color: "var(--text-muted)"
                }}
            >
              {"🤝 Patrocinadores e apoiadores agora são gerenciados na aba dedicada \"Patrocinadores\" deste evento."}
            </div>,
             <hr
              className={"divider"}
             />,
             <div
              style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "flex-start",
                    marginBottom: "0.5rem"
                }}
            >
              {[
                     <div>
                      {[
                             <label
                              className={"form-label"}
                              style={{
                                    margin: 0
                                }}
                            >
                              {"Capa Personalizada"}
                            </label>,
                             <p
                              style={{
                                    fontSize: "0.72rem",
                                    color: "var(--text-dim)",
                                    marginTop: "0.2rem"
                                }}
                            >
                              {"Use uma imagem externa como capa do \xe1lbum na home, sem precisar ser uma das fotos."}
                            </p>
                        ]}
                    </div>,
                     <button
                      type={"button"}
                      onClick={async ()=>{
                            const turnOn = !form.usarCapaPersonalizada;
                            if (!turnOn) {
                                const accepted = await confirm({
                                    title: "Desativar capa personalizada",
                                    message: "O álbum voltará a usar a foto de capa definida na aba Fotos.",
                                    confirmText: "Desativar",
                                    cancelText: "Cancelar"
                                });
                                if (!accepted) return;
                            }
                            handleChange("usarCapaPersonalizada", turnOn);
                        }}
                      style={{
                            padding: "0.3rem 0.9rem",
                            borderRadius: "100px",
                            border: "none",
                            cursor: "pointer",
                            fontSize: "0.75rem",
                            fontWeight: 600,
                            marginLeft: "1rem",
                            flexShrink: 0,
                            background: form.usarCapaPersonalizada ? "var(--success)" : "var(--bg-input)",
                            color: form.usarCapaPersonalizada ? "#fff" : "var(--text-dim)",
                            transition: "all 0.2s"
                        }}
                    >
                      {form.usarCapaPersonalizada ? "● Ativo" : "○ Inativo"}
                    </button>
                ]}
            </div>,
            form.usarCapaPersonalizada &&  <div
              className={"form-group"}
            >
              {[
                     <input
                      type={"text"}
                      className={"form-input"}
                      placeholder={"URL (https://...) ou nome do arquivo em /uploads/"}
                      value={form.capaPersonalizadaUrl}
                      onChange={(e)=>handleChange("capaPersonalizadaUrl", e.target.value)}
                     />,
                     <label
                      className={"btn btn-ghost btn-sm"}
                      style={{
                            cursor: "pointer",
                            marginTop: "0.4rem",
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "0.3rem"
                        }}
                    >
                      {[
                             "📁 Enviar imagem",
                             <input
                              type={"file"}
                              accept={"image/*"}
                              style={{
                                    display: "none"
                                }}
                              onChange={async (e)=>{
                                    const file = e.target.files?.[0];
                                    if (!file) return;
                                    const fd = new FormData();
                                    fd.append("file", file);
                                    try {
                                        const r = await fetch("/api/events/".concat(event.id, "/upload-cover"), {
                                            method: "POST",
                                            body: fd
                                        });
                                        const data = await r.json().catch(()=>({}));
                                        if (!r.ok) throw new Error(data.error || "Erro ao enviar imagem.");
                                        const { filename } = data;
                                        handleChange("capaPersonalizadaUrl", filename);
                                    } catch (error) {
                                        if (showToast) showToast(error.message || "Erro ao enviar imagem.");
                                    }
                                }}
                             />
                        ]}
                    </label>,
                    form.capaPersonalizadaUrl &&  <div
                      style={{
                            marginTop: "0.6rem",
                            height: "130px",
                            borderRadius: "var(--radius)",
                            overflow: "hidden",
                            background: "var(--bg-input)",
                            border: "1px solid var(--border)"
                        }}
                    >
                      { <img
                        src={form.capaPersonalizadaUrl.startsWith("http") ? form.capaPersonalizadaUrl : "/uploads/".concat(form.capaPersonalizadaUrl)}
                        alt={"Preview"}
                        style={{
                                width: "100%",
                                height: "100%",
                                objectFit: "cover"
                            }}
                        onError={(e)=>{
                                e.target.style.display = "none";
                            }}
                       />}
                    </div>
                ]}
            </div>,
             <div
              style={{
                    marginTop: "1.5rem"
                }}
            >
              {[
                     <button
                      className={"btn ".concat(isDirty ? "btn-state-dirty" : "btn-state-clean")}
                      onClick={handleSave}
                      disabled={saving || !isDirty}
                    >
                      {saving ? "Salvando..." : "Salvar Informa\xe7\xf5es"}
                    </button>,
                    isDirty &&  <span
                      style={{
                            marginLeft: "1rem",
                            fontSize: "0.78rem",
                            color: "var(--text-dim)"
                        }}
                    >
                      {"Altera\xe7\xf5es n\xe3o salvas"}
                    </span>
                ]}
            </div>
        ]}
    </div>;
}

function TabWatermark(param) {
    let { event, onSave, onChange } = param;
    const defaults = useMemo(()=>getDefaultDerivativeConfig(), []);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [overrideEnabled, setOverrideEnabled] = useState(!!(event === null || event === void 0 ? void 0 : event.watermarkOverride));
    const [globalAsset, setGlobalAsset] = useState(null);
    const [assets, setAssets] = useState([]);
    const [msg, setMsg] = useState("");
    const [cfg, setCfg] = useState(()=> ({
            watermarkAsset: (event === null || event === void 0 ? void 0 : event.watermarkAsset) || null,
            watermarkOpacity: defaults.watermarkOpacity,
            watermarkPosition: defaults.watermarkPosition,
            watermarkAnchor: defaults.watermarkAnchor,
            watermarkSizeMode: defaults.watermarkSizeMode,
            watermarkOffsetX: defaults.watermarkOffsetX,
            watermarkOffsetY: defaults.watermarkOffsetY,
            watermarkScalePercent: defaults.watermarkScalePercent,
            watermarkVariants: { ...defaults.watermarkVariants }
        }));
    useEffect(()=>{
        async function load() {
            try {
                const [cfgRes, assetsRes] = await Promise.all([fetch("/api/config"), fetch("/api/watermark/assets")]);
                if (cfgRes.ok) {
                    const g = await cfgRes.json();
                    setGlobalAsset(g.watermarkAsset || null);
                }
                if (assetsRes.ok) {
                    const data = await assetsRes.json();
                    setAssets(Array.isArray(data.assets) ? data.assets : []);
                }
            } finally{
                setLoading(false);
            }
        }
        load();
    }, [event === null || event === void 0 ? void 0 : event.id]);
    useEffect(()=>{
        const base = (event === null || event === void 0 ? void 0 : event.watermarkConfig) || {};
        setOverrideEnabled(!!(event === null || event === void 0 ? void 0 : event.watermarkOverride));
        setCfg({
            watermarkAsset: (event === null || event === void 0 ? void 0 : event.watermarkAsset) || globalAsset || defaults.watermarkAsset,
            watermarkOpacity: base.watermarkOpacity ?? defaults.watermarkOpacity,
            watermarkPosition: base.watermarkPosition ?? defaults.watermarkPosition,
            watermarkAnchor: base.watermarkAnchor ?? defaults.watermarkAnchor,
            watermarkSizeMode: base.watermarkSizeMode ?? defaults.watermarkSizeMode,
            watermarkOffsetX: Number.isFinite(base.watermarkOffsetX) ? base.watermarkOffsetX : defaults.watermarkOffsetX,
            watermarkOffsetY: Number.isFinite(base.watermarkOffsetY) ? base.watermarkOffsetY : defaults.watermarkOffsetY,
            watermarkScalePercent: Number.isFinite(base.watermarkScalePercent) ? base.watermarkScalePercent : defaults.watermarkScalePercent,
            watermarkVariants: {
                ...defaults.watermarkVariants,
                ...(base.watermarkVariants || {})
            }
        });
    }, [event, globalAsset, defaults]);
    async function handleSave() {
        setSaving(true);
        const payloadConfig = {
            watermarkOpacity: cfg.watermarkOpacity,
            watermarkPosition: cfg.watermarkPosition,
            watermarkAnchor: cfg.watermarkAnchor,
            watermarkSizeMode: cfg.watermarkSizeMode,
            watermarkOffsetX: cfg.watermarkOffsetX,
            watermarkOffsetY: cfg.watermarkOffsetY,
            watermarkScalePercent: cfg.watermarkScalePercent,
            watermarkVariants: cfg.watermarkVariants
        };
        try {
            await onSave({
                watermarkOverride: overrideEnabled,
                watermarkAsset: cfg.watermarkAsset || null,
                watermarkConfig: payloadConfig
            });
            if (onChange) {
                onChange({
                    watermarkOverride: overrideEnabled,
                    watermarkAsset: cfg.watermarkAsset || null,
                    watermarkConfig: payloadConfig
                });
            }
            setMsg("Salvo com sucesso.");
        } catch (e) {
            setMsg("Erro ao salvar.");
        }
        setSaving(false);
        setTimeout(()=>setMsg(""), 3500);
    }
    const anchors = [
        "top-left",
        "top",
        "top-right",
        "center-left",
        "center",
        "center-right",
        "bottom-left",
        "bottom",
        "bottom-right"
    ];
    if (loading) return (
      <div
        style={{
            minHeight: "220px"
        }}
        className={"flex-center"}
      >
        <div className={"spinner"} />
      </div>
    );
    return (
      <div
        className={"card"}
        style={{
            padding: "1rem",
            display: "grid",
            gap: "0.9rem"
        }}
      >
      <div
        style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: "1rem",
                flexWrap: "wrap"
            }}
      >
        <div>
          <h3 style={{
                    margin: 0
                }}>Marca d&apos;água do álbum</h3>
          <p style={{
                    color: "var(--text-dim)",
                    margin: "0.2rem 0",
                    fontSize: "0.9rem"
                }}>Use a configuração global ou personalize apenas este álbum.</p>
        </div>
        <label style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "0.4rem",
                    cursor: "pointer"
                }}>
          <input
            type="checkbox"
            checked={overrideEnabled}
            onChange={(e)=>setOverrideEnabled(e.target.checked)}
          />
          <span>Usar configurações próprias</span>
        </label>
      </div>
      <div
        style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
                gap: "0.75rem",
                opacity: overrideEnabled ? 1 : 0.6
            }}
      >
        <div className={"form-group"} style={{
                    margin: 0
                }}>
          <label className={"form-label"}>PNG base</label>
          <select
            className={"form-input"}
            disabled={!overrideEnabled}
            value={cfg.watermarkAsset || ""}
            onChange={(e)=>setCfg((prev)=>({ ...prev, watermarkAsset: e.target.value || null }))}
          >
            <option value="">{globalAsset ? `Global (${globalAsset})` : "Global (padr\u00e3o)"}</option>
            {assets.map((asset)=> <option
                key={asset.id}
                value={asset.id}
              >
                {asset.name || asset.id}
              </option>)}
          </select>
        </div>
        <div className={"form-group"} style={{
                    margin: 0
                }}>
          <label className={"form-label"}>Opacidade ({Math.round((cfg.watermarkOpacity || 0) * 100)}%)</label>
          <input
            type="range"
            min="0"
            max="100"
            value={Math.round((cfg.watermarkOpacity || 0) * 100)}
            disabled={!overrideEnabled}
            onChange={(e)=>setCfg((prev)=>({ ...prev, watermarkOpacity: Number(e.target.value) / 100 }))}
          />
        </div>
        <div className={"form-group"} style={{
                    margin: 0
                }}>
          <label className={"form-label"}>Tamanho (% proporção)</label>
          <input
            type="range"
            min="5"
            max="200"
            value={cfg.watermarkScalePercent ?? 40}
            disabled={!overrideEnabled}
            onChange={(e)=>setCfg((prev)=>({ ...prev, watermarkScalePercent: Number(e.target.value) }))}
          />
        </div>
        <div className={"form-group"} style={{
                    margin: 0
                }}>
          <label className={"form-label"}>Modo de ajuste</label>
          <select
            className={"form-input"}
            disabled={!overrideEnabled}
            value={cfg.watermarkSizeMode}
            onChange={(e)=>setCfg((prev)=>({ ...prev, watermarkSizeMode: e.target.value }))}
          >
            <option value="proportional">Proporcional</option>
            <option value="fit">Ajustar</option>
            <option value="fill">Preencher</option>
          </select>
        </div>
        <div className={"form-group"} style={{
                    margin: 0
                }}>
          <label className={"form-label"}>Posição/âncora</label>
          <select
            className={"form-input"}
            disabled={!overrideEnabled}
            value={cfg.watermarkAnchor}
            onChange={(e)=>setCfg((prev)=>({ ...prev, watermarkAnchor: e.target.value, watermarkPosition: e.target.value }))}
          >
            {anchors.map((a)=> <option
                key={a}
                value={a}
              >
                {a}
              </option>)}
          </select>
        </div>
        <div className={"form-group"} style={{
                    margin: 0
                }}>
          <label className={"form-label"}>Deslocamento X</label>
          <input
            type="number"
            min="-10"
            max="10"
            disabled={!overrideEnabled}
            className={"form-input"}
            value={cfg.watermarkOffsetX ?? 0}
            onChange={(e)=>setCfg((prev)=>({ ...prev, watermarkOffsetX: Number(e.target.value) }))}
          />
        </div>
        <div className={"form-group"} style={{
                    margin: 0
                }}>
          <label className={"form-label"}>Deslocamento Y</label>
          <input
            type="number"
            min="-10"
            max="10"
            disabled={!overrideEnabled}
            className={"form-input"}
            value={cfg.watermarkOffsetY ?? 0}
            onChange={(e)=>setCfg((prev)=>({ ...prev, watermarkOffsetY: Number(e.target.value) }))}
          />
        </div>
      </div>
      <div
        style={{
                border: "1px solid var(--border)",
                borderRadius: "var(--radius)",
                padding: "0.75rem"
            }}
      >
        <div style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginBottom: "0.5rem"
                }}>
          <strong>Overrides por derivada</strong>
          <span style={{
                        color: "var(--text-muted)",
                        fontSize: "0.8rem"
                    }}>Opcional</span>
        </div>
        <div style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                    gap: "0.6rem"
                }}>
          {["grid", "thumbs", "mini", "covers"].map((variant)=>{
            const vcfg = cfg.watermarkVariants?.[variant] || {};
            return  <div
              key={variant}
              style={{
                            border: "1px solid var(--border)",
                            borderRadius: "var(--radius)",
                            padding: "0.65rem",
                            opacity: overrideEnabled ? 1 : 0.6
                        }}
            >
              <label style={{
                                display: "flex",
                                gap: "0.4rem",
                                alignItems: "center"
                            }}>
                <input
                  type="checkbox"
                  disabled={!overrideEnabled}
                  checked={!!vcfg.enabled}
                  onChange={(e)=>setCfg((prev)=>({ ...prev, watermarkVariants: { ...prev.watermarkVariants, [variant]: { ...(prev.watermarkVariants?.[variant] || {}), enabled: e.target.checked } } }))}
                />
                <span>{variant}</span>
              </label>
              <select
                className={"form-input"}
                style={{
                                    marginTop: "0.4rem"
                                }}
                disabled={!overrideEnabled || !vcfg.enabled}
                value={vcfg.asset || ""}
                onChange={(e)=>setCfg((prev)=>({ ...prev, watermarkVariants: { ...prev.watermarkVariants, [variant]: { ...(prev.watermarkVariants?.[variant] || {}), asset: e.target.value || null } } }))}
              >
                <option value="">Usar PNG base</option>
                {assets.map((asset)=> <option
                    key={asset.id}
                    value={asset.id}
                  >
                    {asset.name || asset.id}
                  </option>)}
              </select>
            </div>;
        })}
        </div>
      </div>
      <div style={{
                display: "flex",
                gap: "0.75rem",
                alignItems: "center"
            }}>
        <button
          className={"btn btn-secondary"}
          onClick={handleSave}
          disabled={saving}
          type="button"
        >
          {saving ? "Salvando..." : "Salvar"}
        </button>
        <span style={{
                    color: msg ? "var(--text)" : "var(--text-muted)",
                    fontSize: "0.85rem"
                }}>{msg || (overrideEnabled ? "Personalização ativa para este álbum." : "Herdando configuração global.")}</span>
      </div>
      </div>
    );
}

// ===================== SHARED TABLE STYLES =====================
const thS = {
    padding: "0.6rem 0.5rem",
    textAlign: "left",
    fontSize: "0.7rem",
    color: "var(--text-dim)",
    textTransform: "uppercase",
    letterSpacing: "0.06em",
    fontWeight: 500,
    whiteSpace: "nowrap"
};
const tdS = {
    padding: "0.6rem 0.5rem",
    fontSize: "0.82rem",
    color: "var(--text)",
    verticalAlign: "middle"
};
