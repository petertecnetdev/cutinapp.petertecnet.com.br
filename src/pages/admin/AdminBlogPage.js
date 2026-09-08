import React, { useContext, useEffect, useMemo, useState } from "react";
import { Alert, Badge, Button, Card, Col, Container, Form, Modal, Row, Spinner } from "react-bootstrap";
import NavlogComponent from "../../components/NavlogComponent";
import { AuthContext } from "../../context/AuthContext";
import blogService from "../../services/BlogService";
import { isPeterTecnetRoot } from "../../utils/applicationRoles";
import "../../styles/blog.css";

const emptyForm = {
  title: "", slug: "", excerpt: "", content: "", category: "Eventos", tags: "",
  cover_image: "", seo_title: "", seo_description: "", status: "draft",
};

export default function AdminBlogPage() {
  const { user } = useContext(AuthContext);
  const root = isPeterTecnetRoot(user);
  const [entries, setEntries] = useState([]);
  const [applicationId, setApplicationId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [show, setShow] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyForm);

  const load = async () => {
    setLoading(true); setError("");
    try {
      const data = await blogService.adminContext();
      const app = (data?.applications || []).find((item) => item.slug === "cutinapp");
      if (!app) throw new Error("Aplicação Cutinapp não encontrada na API.");
      setApplicationId(app.id);
      setEntries((data?.entries || []).filter((item) => Number(item.application_id) === Number(app.id) && item.type === "article"));
    } catch (err) { setError(err.message || "Não foi possível carregar os artigos."); }
    finally { setLoading(false); }
  };

  useEffect(() => { if (root) load(); else setLoading(false); }, [root]);

  const summary = useMemo(() => ({
    total: entries.length,
    published: entries.filter((item) => item.status === "published").length,
    drafts: entries.filter((item) => item.status === "draft").length,
  }), [entries]);

  const openNew = () => { setEditing(null); setForm(emptyForm); setShow(true); };
  const openEdit = (entry) => {
    setEditing(entry);
    setForm({
      title: entry.title || "", slug: entry.slug || "", excerpt: entry.excerpt || "", content: entry.content || "",
      category: entry.category || "Eventos", tags: (entry.tags || []).join(", "), cover_image: entry.cover_image || "",
      seo_title: entry.seo_title || "", seo_description: entry.seo_description || "", status: entry.status || "draft",
    });
    setShow(true);
  };

  const change = (field) => (event) => setForm((current) => ({ ...current, [field]: event.target.value }));

  const save = async (event) => {
    event.preventDefault();
    if (!applicationId) return;
    setSaving(true); setError(""); setNotice("");
    try {
      const payload = {
        application_id: applicationId,
        type: "article",
        title: form.title.trim(),
        slug: form.slug.trim() || undefined,
        excerpt: form.excerpt.trim() || null,
        content: form.content,
        category: form.category.trim() || "Eventos",
        tags: form.tags.split(",").map((tag) => tag.trim()).filter(Boolean),
        cover_image: form.cover_image.trim() || null,
        seo_title: form.seo_title.trim() || null,
        seo_description: form.seo_description.trim() || null,
        status: form.status,
      };
      if (editing) await blogService.update(editing.id, payload); else await blogService.create(payload);
      setShow(false); setNotice(editing ? "Artigo atualizado com sucesso." : "Artigo criado com sucesso.");
      await load();
    } catch (err) { setError(err.message || "Não foi possível salvar o artigo."); }
    finally { setSaving(false); }
  };

  const publish = async (entry) => {
    if (!window.confirm(`Publicar “${entry.title}” agora?`)) return;
    try { await blogService.publish(entry.id); setNotice("Artigo publicado."); await load(); }
    catch (err) { setError(err.message || "Não foi possível publicar."); }
  };

  const remove = async (entry) => {
    if (!window.confirm(`Excluir definitivamente “${entry.title}”?`)) return;
    try { await blogService.remove(entry.id); setNotice("Artigo excluído."); await load(); }
    catch (err) { setError(err.message || "Não foi possível excluir."); }
  };

  if (!root) return <div className="cut-app-page"><NavlogComponent /><Container className="cut-page-container py-5"><Alert variant="danger">Acesso exclusivo do Super Admin da Peter Tecnet.</Alert></Container></div>;

  return <div className="cut-app-page cut-blog-admin">
    <NavlogComponent />
    <Container className="cut-page-container py-4 py-lg-5">
      <div className="cut-page-heading align-items-start">
        <div><span className="cut-eyebrow">Cutinapp · Conteúdo editorial</span><h1>Blog da Cutinapp</h1><p>Crie conteúdo exclusivo da plataforma com foco em SEO, descoberta e relacionamento com a comunidade.</p></div>
        <Button variant="dark" onClick={openNew}><i className="fa-solid fa-plus me-2" />Novo artigo</Button>
      </div>

      <Row className="g-3 mb-4">
        <Col xs={4}><Card className="cut-panel h-100"><Card.Body><small>Total</small><div className="h2 mb-0">{summary.total}</div></Card.Body></Card></Col>
        <Col xs={4}><Card className="cut-panel h-100"><Card.Body><small>Publicados</small><div className="h2 mb-0">{summary.published}</div></Card.Body></Card></Col>
        <Col xs={4}><Card className="cut-panel h-100"><Card.Body><small>Rascunhos</small><div className="h2 mb-0">{summary.drafts}</div></Card.Body></Card></Col>
      </Row>

      {notice && <Alert variant="success">{notice}</Alert>}{error && <Alert variant="danger">{error}</Alert>}
      {loading ? <div className="text-center py-5"><Spinner /></div> : <div className="d-grid gap-3">
        {entries.map((entry) => <Card className="cut-panel" key={entry.id}><Card.Body className="d-flex flex-column flex-lg-row gap-3 align-items-lg-center justify-content-between">
          <div><div className="d-flex flex-wrap gap-2 mb-2"><Badge bg={entry.status === "published" ? "success" : "secondary"}>{entry.status}</Badge>{entry.category && <Badge bg="dark">{entry.category}</Badge>}</div><h2 className="h5 mb-1">{entry.title}</h2><small className="text-secondary">/blog/{entry.slug}</small></div>
          <div className="d-flex flex-wrap gap-2"><Button size="sm" variant="outline-dark" onClick={() => openEdit(entry)}>Editar</Button>{entry.status !== "published" && <Button size="sm" variant="success" onClick={() => publish(entry)}>Publicar</Button>}<Button size="sm" variant="outline-danger" onClick={() => remove(entry)}>Excluir</Button></div>
        </Card.Body></Card>)}
        {entries.length === 0 && <Alert variant="info">Nenhum artigo da Cutinapp criado ainda.</Alert>}
      </div>}
    </Container>

    <Modal show={show} onHide={() => !saving && setShow(false)} size="lg" centered scrollable>
      <Form onSubmit={save}><Modal.Header closeButton><Modal.Title>{editing ? "Editar artigo" : "Novo artigo"}</Modal.Title></Modal.Header><Modal.Body>
        <Row className="g-3">
          <Col xs={12}><Form.Label>Título</Form.Label><Form.Control required maxLength={220} value={form.title} onChange={change("title")} /></Col>
          <Col md={7}><Form.Label>Slug (opcional)</Form.Label><Form.Control value={form.slug} onChange={change("slug")} placeholder="gerado automaticamente" /></Col>
          <Col md={5}><Form.Label>Categoria</Form.Label><Form.Control value={form.category} onChange={change("category")} /></Col>
          <Col xs={12}><Form.Label>Resumo</Form.Label><Form.Control as="textarea" rows={2} value={form.excerpt} onChange={change("excerpt")} /></Col>
          <Col xs={12}><Form.Label>Conteúdo</Form.Label><Form.Control required as="textarea" rows={12} value={form.content} onChange={change("content")} placeholder="Escreva o artigo completo..." /></Col>
          <Col xs={12}><Form.Label>Tags</Form.Label><Form.Control value={form.tags} onChange={change("tags")} placeholder="eventos, ingressos, produtores" /></Col>
          <Col xs={12}><Form.Label>URL da imagem de capa</Form.Label><Form.Control type="url" value={form.cover_image} onChange={change("cover_image")} /></Col>
          <Col md={6}><Form.Label>Título SEO</Form.Label><Form.Control value={form.seo_title} onChange={change("seo_title")} /></Col>
          <Col md={6}><Form.Label>Descrição SEO</Form.Label><Form.Control value={form.seo_description} onChange={change("seo_description")} /></Col>
          <Col md={5}><Form.Label>Status</Form.Label><Form.Select value={form.status} onChange={change("status")}><option value="draft">Rascunho</option><option value="published">Publicado</option><option value="archived">Arquivado</option></Form.Select></Col>
        </Row>
      </Modal.Body><Modal.Footer><Button variant="outline-secondary" onClick={() => setShow(false)} disabled={saving}>Cancelar</Button><Button type="submit" variant="dark" disabled={saving}>{saving ? "Salvando..." : "Salvar artigo"}</Button></Modal.Footer></Form>
    </Modal>
  </div>;
}
