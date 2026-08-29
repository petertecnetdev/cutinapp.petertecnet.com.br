import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import CutinLayout from "../components/CutinLayout";
import CutinService from "../services/CutinService";
import "./CutinPages.css";

export default function CutinHomePage(){
  const [events,setEvents]=useState([]); const [loading,setLoading]=useState(true);
  useEffect(()=>{CutinService.events().then(v=>setEvents(Array.isArray(v)?v.slice(0,6):[])).catch(()=>setEvents([])).finally(()=>setLoading(false));},[]);
  return <CutinLayout>
    <section className="cutin-hero"><div><span className="eyebrow">A cidade acontece aqui</span><h1>Descubra, produza e viva experiências.</h1><p>Encontre eventos na sua cidade, compre ingressos e produtos, acompanhe novidades e conecte-se com quem faz cada experiência acontecer.</p><div className="hero-actions"><Link to="/eventos" className="primary">Explorar eventos</Link><Link to="/produtor" className="secondary">Quero produzir</Link></div></div><div className="hero-orbit"><span>INGRESSOS</span><span>EVENTOS</span><span>PRODUTOS</span><span>PROMOTERS</span></div></section>
    <section className="cutin-section"><div className="section-head"><div><span className="eyebrow">Em destaque</span><h2>O que está rolando</h2></div><Link to="/eventos">Ver todos</Link></div>{loading?<div className="empty-card">Carregando eventos...</div>:events.length?<div className="event-grid">{events.map((e,i)=><article className="event-card" key={e.id||i}><div className="event-cover" style={e.image?{backgroundImage:`url(${e.image})`}:undefined}><span>{e.city||e.address_city||"Evento"}</span></div><div className="event-body"><small>{e.date||e.start_at||"Data a confirmar"}</small><h3>{e.name||e.title||"Evento Cutinapp"}</h3><p>{e.description||"Ingressos, produtos e informações do evento em um só lugar."}</p><Link to={e.slug?`/evento/${e.slug}`:"/eventos"}>Ver evento</Link></div></article>)}</div>:<div className="empty-card">Os próximos eventos publicados aparecerão aqui.</div>}</section>
    <section className="cutin-section feature-grid"><article><b>Para participantes</b><h3>Descubra sua cidade</h3><p>Agenda, ingressos, produtos antecipados, promoções e seus eventos favoritos.</p></article><article><b>Para produtores</b><h3>Controle a operação</h3><p>Cadastre eventos, lotes, produtos, equipe, vendas e acompanhe resultados.</p></article><article><b>Para promoters</b><h3>Venda e ganhe comissão</h3><p>Links e códigos próprios para atribuir vendas com transparência.</p></article><article><b>Para equipes</b><h3>Todo mundo conectado</h3><p>Fornecedores, colaboradores e funções organizadas por evento.</p></article></section>
  </CutinLayout>
}
