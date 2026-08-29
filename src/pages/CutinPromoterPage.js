import React,{useEffect,useState}from"react";
import{Link}from"react-router-dom";
import CutinLayout from"../components/CutinLayout";
import CutinService from"../services/CutinService";
import"./CutinPages.css";

const money=v=>new Intl.NumberFormat("pt-BR",{style:"currency",currency:"BRL"}).format(Number(v||0));
const date=v=>v?new Intl.DateTimeFormat("pt-BR",{dateStyle:"medium"}).format(new Date(v)):"—";

export default function CutinPromoterPage(){
 const[data,setData]=useState(null);const[error,setError]=useState("");
 useEffect(()=>{CutinService.myPromoterPortal().then(setData).catch(e=>setError(e?.response?.data?.message||"Não foi possível carregar suas campanhas."))},[]);
 const copy=async campaign=>{const url=`${window.location.origin}/evento/${campaign.event_id}?ref=${campaign.code}`;try{await navigator.clipboard.writeText(url)}catch{}};
 if(!data)return <CutinLayout><section className="cutin-section"><div className="empty-card">{error||"Carregando suas campanhas..."}</div></section></CutinLayout>;
 const s=data.summary||{};
 return <CutinLayout><section className="cutin-section"><span className="eyebrow">Área do promoter</span><h1 className="page-title">Suas vendas. Sua comissão.</h1><p className="page-subtitle">Acompanhe os eventos em que você promove, copie seus links rastreáveis e confira quanto já vendeu e quanto tem a receber.</p><div className="dashboard-grid"><div className="metric"><span>Campanhas</span><strong>{s.campaigns||0}</strong></div><div className="metric"><span>Vendas</span><strong>{s.sales||0}</strong></div><div className="metric"><span>Volume vendido</span><strong>{money(s.revenue)}</strong></div><div className="metric"><span>Comissão gerada</span><strong>{money(s.commission_total)}</strong></div><div className="metric"><span>Disponível</span><strong>{money(s.commission_available)}</strong></div><div className="metric"><span>Já paga</span><strong>{money(s.commission_paid)}</strong></div></div><div className="panel"><h2>Campanhas</h2>{(data.campaigns||[]).length?(data.campaigns||[]).map(c=><article className="promoter-campaign" key={c.id}><div><span className={`status ${c.active?"valid":"cancelled"}`}>{c.active?"ativa":"pausada"}</span><h3>{c.event_title}</h3><p>{date(c.start_date)} · {c.venue||c.city||""}</p><small>Código: <b>{c.code}</b> · comissão {c.commission_type==="percentage"?`${c.commission_value}%`:money(c.commission_value)}</small></div><div className="promoter-numbers"><span><small>Vendas</small><b>{c.sales_count}</b></span><span><small>Receita</small><b>{money(c.revenue)}</b></span><span><small>Comissão</small><b>{money(c.commission_total)}</b></span><span><small>Disponível</small><b>{money(c.commission_available)}</b></span></div><div className="inline-actions"><button className="primary" onClick={()=>copy(c)}>Copiar meu link</button><Link className="secondary" to={`/evento/${c.event_id}?ref=${c.code}`}>Abrir evento</Link></div></article>):<div className="empty-card">Você ainda não está vinculado como promoter a nenhum evento.</div>}</div></section></CutinLayout>
}
