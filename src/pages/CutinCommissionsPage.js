import React,{useCallback,useEffect,useState}from"react";
import{Link,useParams}from"react-router-dom";
import CutinLayout from"../components/CutinLayout";
import CutinService from"../services/CutinService";
import"./CutinPages.css";

const money=v=>new Intl.NumberFormat("pt-BR",{style:"currency",currency:"BRL"}).format(Number(v||0));
const errorMessage=e=>e?.response?.data?.message||Object.values(e?.response?.data?.errors||{}).flat()[0]||"Não foi possível concluir a operação.";

export default function CutinCommissionsPage(){
 const{eventId}=useParams();const[promoters,setPromoters]=useState([]);const[details,setDetails]=useState({});const[error,setError]=useState("");
 const load=useCallback(async()=>{try{const list=await CutinService.promoters(eventId);const rows=Array.isArray(list)?list:[];setPromoters(rows);const pairs=await Promise.all(rows.map(async p=>{try{return[p.id,await CutinService.promoterCommissions(eventId,p.id)]}catch(requestError){console.warn("Não foi possível carregar o saldo de um promoter.",requestError);return[p.id,{available:0,paid:0,pending:0,entries:[]}]}}));setDetails(Object.fromEntries(pairs));setError("")}catch(e){setError(errorMessage(e))}},[eventId]);
 useEffect(()=>{load()},[load]);
 const payout=async promoter=>{const d=details[promoter.id]||{};if(Number(d.available||0)<=0)return;const reference=window.prompt(`Referência do pagamento de ${money(d.available)} para ${promoter.name||promoter.code}:`,"");if(reference===null)return;try{await CutinService.payoutPromoter(eventId,promoter.id,{payout_reference:reference||undefined});await load()}catch(e){setError(errorMessage(e))}};
 return <CutinLayout><section className="cutin-section"><div className="section-head"><div><span className="eyebrow">Financeiro</span><h1>Comissões de promoters</h1><p className="page-subtitle">Confira o saldo gerado pelas vendas atribuídas e registre os repasses realizados.</p></div><Link className="secondary" to={`/gerenciar/evento/${eventId}`}>Voltar ao evento</Link></div>{error&&<div className="error-box">{error}</div>}<div className="panel"><table><thead><tr><th>Promoter</th><th>Regra</th><th>Disponível</th><th>Pago</th><th>Pendente</th><th></th></tr></thead><tbody>{promoters.map(p=>{const d=details[p.id]||{};return <tr key={p.id}><td><strong>{p.name||p.code}</strong><small>{p.email||p.code}</small></td><td>{p.commission_type==="percentage"?`${p.commission_value}%`:money(p.commission_value)}</td><td>{money(d.available)}</td><td>{money(d.paid)}</td><td>{money(d.pending)}</td><td><button type="button" disabled={Number(d.available||0)<=0} onClick={()=>payout(p)}>Registrar pagamento</button></td></tr>})}</tbody></table>{!promoters.length&&<div className="empty-card">Nenhum promoter cadastrado neste evento.</div>}</div></section></CutinLayout>;
}
