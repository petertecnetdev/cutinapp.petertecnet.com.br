import React, { useState, useEffect } from "react";
import {
  Form,
  Button,
  Container,
  Row,
  Col,
  Card,
  Alert,
} from "react-bootstrap";
import productionService from "../../services/ProductionService";
import NavlogComponent from "../../components/NavlogComponent";
import { Link, useParams, useNavigate } from "react-router-dom";
import { storageUrl } from "../../config";
import LoadingComponent from "../../components/LoadingComponent";
import seguiments from "../../utils/seguiments";

const ProductionUpdatePage = () => {
  const { id } = useParams(); // Obter o ID da produção da URL
  const [formData, setFormData] = useState({
    segments: [], // Initialize segments with an empty array
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [successMessage, setSuccessMessage] = useState(null);
  const [logoPreview, setLogoPreview] = useState(null);
  const [backgroundPreview, setBackgroundPreview] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    const fetchProduction = async () => {
      try {
        const production = await productionService.show(id);
        setFormData(production);
        if (production.logo) {
          setLogoPreview(`${storageUrl}/${production.logo}`);
        }
        if (production.background) {
          setBackgroundPreview(`${storageUrl}/${production.background}`);
        }
      } catch (error) {
        setError("Erro ao carregar informações da produção.");
      }
    };

    fetchProduction();
  }, [id]);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData({
      ...formData,
      [name]: value,
    });
  };

  const handleLogoChange = (e) => {
    const file = e.target.files[0];
    setFormData({
      ...formData,
      logo: file,
    });
    // Preview da imagem
    const reader = new FileReader();
    reader.onloadend = () => {
      // Redimensionar a imagem para 150x150
      const img = new Image();
      img.src = reader.result;
      img.onload = () => {
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");
        canvas.width = 150;
        canvas.height = 150;
        ctx.drawImage(img, 0, 0, 150, 150);
        const resizedDataURL = canvas.toDataURL("image/png");
        setLogoPreview(resizedDataURL);
      };
    };
    reader.readAsDataURL(file);
  };


  const handleBackgroundChange = (e) => {
    const file = e.target.files[0];
    setFormData({
      ...formData,
      background: file,
    });
    // Preview da imagem
    const reader = new FileReader();
    reader.onloadend = () => {
      // Redimensionar a imagem para 1920x600
      const img = new Image();
      img.src = reader.result;
      img.onload = () => {
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");
        canvas.width = 1920;
        canvas.height = 600;
        ctx.drawImage(img, 0, 0, 1920, 600);
        const resizedDataURL = canvas.toDataURL("image/png");
        setBackgroundPreview(resizedDataURL);
      };
    };
    reader.readAsDataURL(file);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const response = await productionService.update(id, formData);
      setSuccessMessage(response);
      setTimeout(() => setSuccessMessage(null), 5000);
    } catch (error) {
      setError("Erro ao atualizar a produção. Por favor, tente novamente.");
    } finally {
      setLoading(false);
    }
  };


  useEffect(() => {
    let timer;
    if (error || successMessage) {
      timer = setTimeout(() => {
        setError(null);
        setSuccessMessage(null);
      }, 5000);
    }

    return () => clearTimeout(timer);
  }, [error, successMessage]);

  if (loading) {
    return <LoadingComponent />;
  }

  const handleSeguimentsChange = (seguimentId) => {
    // Check if formData and segments are not null before accessing
    const updatedSegments =
      formData && formData.segments
        ? formData.segments.includes(seguimentId)
          ? formData.segments.filter((id) => id !== seguimentId)
          : [...formData.segments, seguimentId]
        : [seguimentId];
    setFormData({ ...formData, segments: updatedSegments });
  };

  const segmentsPerColumn = 6;
  const segmentChunks = Array.from(
    { length: Math.ceil(Object.keys(seguiments).length / segmentsPerColumn) },
    (_, index) =>
      Object.entries(seguiments).slice(
        index * segmentsPerColumn,
        index * segmentsPerColumn + segmentsPerColumn
      )
  );

  return (
    <>
      <NavlogComponent /> 
      
      <p className="labeltitle h2 text-center text-uppercase">Editar produção</p>
       <label
        htmlFor="BackgroundInput"
        style={{ cursor: "pointer", display: "block" }}
      >
        {backgroundPreview ? (
          <img
            src={backgroundPreview}
            alt="Preview da Background"
            className="img-fluid"
          />
        ) : (
          <img
            src="/images/productionbackground.png"
            alt="Preview da Background"
            className="img-fluid"
          />
        )}
      </label>
      <Form.Control
        id="BackgroundInput"
        type="file"
        accept="image/*"
        onChange={handleBackgroundChange}
        style={{ display: "none" }}
        required
      />
      
      <label
        htmlFor="logoInput"
        style={{ cursor: "pointer", display: "block" }}
      >
        {logoPreview ? (
          <img
            src={logoPreview}
            alt="Preview da Logo"
            className="img-fluid rounded-circle img-logo-production"
            // Ajusta a largura da imagem para preencher o container
          />
        ) : (
          <img
            src="/images/productionlogo.png"
            alt="Preview da Logo"
            className="img-fluid rounded-circle img-logo-production"
            // Ajusta a largura da imagem para preencher o container
          />
        )}
      </label>
      <Form.Control
        id="logoInput"
        type="file"
        accept="image/*"
        onChange={handleLogoChange}
        style={{
          display: "none",
        }}
        required
        className="img-fluid rounded-circle img-logo-production"
      />

      <Container>
          <Row>
            <Col md={12}>
              <Card>
              <p className="labeltitle h4 text-center text-uppercase">Informações básicas</p>
                <Row>
                  <Col md={12}>
                  <Link
                          className="btn btn-primary m-2" 
                          to={`/production/${formData.slug}`}
                          style={{ textDecoration: "none", color: "white" }}
                        >
                          Pagin da produção
                        </Link>
                        <Button
                                variant="primary"
                                size="md"
                                onClick={() =>
                                  navigate(
                                    `/event/create?productionId=${formData.id}`
                                  )
                                }
                              >
                                <i className="bi bi-plus-square m-2 "></i>
                                Novo evento
                              </Button>
            
                  </Col>
                  <Col md={6}>
                  <Form.Group controlId="formName">
                  <Form.Control
                    type="text"
                    name="name"
                    placeholder="Digite o nome da produção"
                    value={formData.name}
                    onChange={handleInputChange}
                    required
                    className="mt-3"
                  />
                </Form.Group>
                  </Col>
                  <Col md={3}>
                  <Form.Group controlId="formPhone">
                  <Form.Control
                    type="text"
                    name="phone"
                    placeholder="Telefone"
                    value={formData.phone}
                    onChange={handleInputChange}
                    required
                    className="mt-3"
                  />
                </Form.Group>
                  </Col>

                  <Col md={3}>
                    <Form.Group controlId="formCNPJ">
                      <Form.Control
                        type="text"
                        name="cnpj"
                        placeholder="Digite o CNPJ"
                        value={formData.cnpj}
                        onChange={handleInputChange}
                        required
                        disabled
                        className="mt-3 disable"
                      />
                    </Form.Group>
                  </Col>
                </Row>
                <Row>
                  {/* Descrição */}
                  <Col md={12} className="mt-2">
                    <Form.Group controlId="formDescription">
                      <Form.Control
                        as="textarea"
                        rows={3}
                        name="description"
                        placeholder="Digite a descrição da produção"
                        value={formData.description}
                        onChange={handleInputChange}
                        required
                      />
                    </Form.Group>
                  </Col>
                </Row>
                <Row>
                  <Col md={6} className="mt-2">
                    <Form.Control
                      type="text"
                      name="facebook_url"
                      placeholder="URL do Facebook"
                      value={formData.facebook_url}
                      onChange={handleInputChange}
                    />
                  </Col>
                  <Col md={6} className="mt-2">
                    <Form.Control
                      type="text"
                      name="twitter_url"
                      placeholder="URL do Twitter"
                      value={formData.twitter_url}
                      onChange={handleInputChange}
                    />
                  </Col>
                  <Col md={6} className="mt-2">
                    <Form.Control
                      type="text"
                      name="instagram_url"
                      placeholder="URL do Instagram"
                      value={formData.instagram_url}
                      onChange={handleInputChange}
                    />
                  </Col>
                  <Col md={6} className="mt-2">
                    <Form.Control
                      type="text"
                      name="youtube_url"
                      placeholder="URL do YouTube"
                      value={formData.youtube_url}
                      onChange={handleInputChange}
                    />
                  </Col>
                </Row>
                
              </Card>
            </Col>
            <Col md={12} className="mt-2">
              <Card>
              <p className="labeltitle h4 text-center text-uppercase">Segumentos</p>
                <Row>
                  {/* Renderização dos seguimentos em colunas */}
                  {segmentChunks.map((chunk, index) => (
                    <React.Fragment key={index}>
                      {chunk.map(([key, value]) => (
                        <Col md={2} key={key}>
                          {/* Check if formData and segments are not null before accessing */}
                          <Form.Check
                            type="checkbox"
                            label={value.name}
                            checked={
                              formData &&
                              formData.segments &&
                              formData.segments.includes(key)
                            }
                            onChange={() => handleSeguimentsChange(key)}
                            className="mt-2"
                          />
                        </Col>
                      ))}
                    </React.Fragment>
                  ))}
                </Row>
                {/* Botão de envio do formulário */}
                <Button
                  variant="primary"
                  type="submit"
                  disabled={loading}
                  className="mt-4 btn-lg"
                  onClick={handleSubmit}
                >
                  {loading ? "Carregando..." : "Salvar"}
                </Button>
              </Card>
            </Col>
          </Row>
      </Container>
      {successMessage && (
        <Alert
          variant="success"
          onClose={() => setSuccessMessage(null)}
          dismissible
          style={{
            position: "fixed",
            top: "150px",
            right: "10px",
            zIndex: "1050",
          }}
        >
          {successMessage}
        </Alert>
      )}
      {error && (
        <Alert
          variant="danger"
          onClose={() => setError(null)}
          dismissible
          style={{
            position: "fixed",
            top: "150px",
            right: "10px",
            zIndex: "1050",
          }}
        >
          {error}
        </Alert>
      )}
    
    </>
  );
};

export default ProductionUpdatePage;
