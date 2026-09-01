import React, { useEffect, useRef, useState } from "react";
import PropTypes from "prop-types";
import { Alert, Col, Form, Row, Spinner } from "react-bootstrap";
import cutinappService from "../../services/CutinappService";

const UFS = ["AC","AL","AP","AM","BA","CE","DF","ES","GO","MA","MT","MS","MG","PA","PB","PR","PE","PI","RJ","RN","RS","RO","RR","SC","SP","SE","TO"];
const digits = (value) => String(value || "").replace(/\D/g, "").slice(0, 8);
const cepMask = (value) => { const d=digits(value); return d.length > 5 ? `${d.slice(0,5)}-${d.slice(5)}` : d; };

export default function LocationFields({ value, onChange, required = false, showPublicToggle = false }) {
  const [cities,setCities]=useState([]); const [loadingCities,setLoadingCities]=useState(false); const [loadingCep,setLoadingCep]=useState(false); const [notice,setNotice]=useState(""); const timer=useRef(null);
  const set=(field,next)=>onChange({ ...value, [field]: next });

  useEffect(()=>()=>clearTimeout(timer.current),[]);
  const chooseUf=(uf)=>onChange({ ...value, uf, city:"", city_id:"" });
  const searchCity=(text)=>{
    onChange({ ...value, city:text, city_id:"" }); setCities([]); clearTimeout(timer.current);
    if(!value.uf || text.trim().length<2)return;
    timer.current=setTimeout(async()=>{setLoadingCities(true);try{setCities(await cutinappService.locationCities(value.uf,text.trim()));}catch{setNotice("Não foi possível consultar cidades agora.");}finally{setLoadingCities(false);}},350);
  };
  const chooseCity=(city)=>{onChange({ ...value, city:city.name, city_id:String(city.ibge_code), uf:city.uf });setCities([]);};
  const lookupCep=async()=>{
    const cep=digits(value.cep); if(cep.length!==8)return; setLoadingCep(true);setNotice("");
    try{const found=await cutinappService.lookupCep(cep);onChange({ ...value, cep:cepMask(cep), address:found.street||value.address, neighborhood:found.neighborhood||value.neighborhood, address_complement:value.address_complement||found.complement||"", uf:found.uf||value.uf, city:found.city||value.city, city_id:found.city_id?String(found.city_id):value.city_id });}
    catch{setNotice("Não conseguimos consultar o CEP. Você pode continuar preenchendo o endereço; cidade e UF ainda precisam ser selecionadas de forma válida.");}
    finally{setLoadingCep(false);}
  };

  return <div className="cut-location-fields">
    {notice&&<Alert variant="warning" className="py-2">{notice}</Alert>}
    <Row className="g-3">
      <Col md={3}><Form.Group><Form.Label>CEP</Form.Label><div className="position-relative"><Form.Control value={value.cep||""} onChange={(e)=>set("cep",cepMask(e.target.value))} onBlur={lookupCep} inputMode="numeric" placeholder="00000-000" />{loadingCep&&<Spinner size="sm" className="cut-location-spinner"/>}</div><Form.Text>Ao sair do campo, tentamos preencher o endereço.</Form.Text></Form.Group></Col>
      <Col md={3}><Form.Group><Form.Label>UF {required&&"*"}</Form.Label><Form.Select value={value.uf||""} onChange={(e)=>chooseUf(e.target.value)} required={required}><option value="">Selecione</option>{UFS.map(uf=><option key={uf}>{uf}</option>)}</Form.Select></Form.Group></Col>
      <Col md={6}><Form.Group className="cut-autocomplete"><Form.Label>Cidade {required&&"*"}</Form.Label><div className="position-relative"><Form.Control value={value.city||""} onChange={(e)=>searchCity(e.target.value)} disabled={!value.uf} autoComplete="off" role="combobox" aria-expanded={cities.length>0} placeholder={value.uf?"Digite ao menos 2 letras":"Escolha a UF primeiro"} required={required}/>{loadingCities&&<Spinner size="sm" className="cut-location-spinner"/>}{cities.length>0&&<div className="cut-autocomplete-menu" role="listbox">{cities.map(city=><button type="button" role="option" key={city.ibge_code} onClick={()=>chooseCity(city)}>{city.name}<small>{city.uf} · IBGE {city.ibge_code}</small></button>)}</div>}</div>{value.city&&!value.city_id&&<Form.Text className="text-warning">Selecione uma cidade da lista. Texto livre não será aceito.</Form.Text>}</Form.Group></Col>
      <Col md={8}><Form.Group><Form.Label>Logradouro</Form.Label><Form.Control value={value.address||""} onChange={(e)=>set("address",e.target.value)} placeholder="Rua, avenida..." /></Form.Group></Col>
      <Col md={4}><Form.Group><Form.Label>Número</Form.Label><Form.Control value={value.address_number||""} onChange={(e)=>set("address_number",e.target.value)} /></Form.Group></Col>
      <Col md={4}><Form.Group><Form.Label>Bairro</Form.Label><Form.Control value={value.neighborhood||""} onChange={(e)=>set("neighborhood",e.target.value)} /></Form.Group></Col>
      <Col md={4}><Form.Group><Form.Label>Complemento</Form.Label><Form.Control value={value.address_complement||""} onChange={(e)=>set("address_complement",e.target.value)} /></Form.Group></Col>
      <Col md={4}><Form.Group><Form.Label>Referência</Form.Label><Form.Control value={value.address_reference||""} onChange={(e)=>set("address_reference",e.target.value)} /></Form.Group></Col>
      {showPublicToggle&&<Col xs={12}><Form.Check type="switch" checked={Boolean(value.location_public)} onChange={(e)=>set("location_public",e.target.checked?1:0)} label="Exibir localização comercial na página pública" /></Col>}
    </Row>
  </div>;
}

LocationFields.propTypes={value:PropTypes.object.isRequired,onChange:PropTypes.func.isRequired,required:PropTypes.bool,showPublicToggle:PropTypes.bool};
