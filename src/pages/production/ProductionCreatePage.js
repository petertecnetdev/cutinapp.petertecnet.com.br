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
import { Link } from "react-router-dom";
import LoadingComponent from "../../components/LoadingComponent";
import seguiments from "../../utils/seguiments";

const ProductionCreatePage = () => {
  const [formData, setFormData] = useState({
    name: "",
    cnpj: "",
    selectedPermissions: [],
    fantasy: "",
    type: "",
    phone: "",
    description: "",
    segments: [],
    city: "",
    location: "",
    cep: "",
    address: "",
    user_id: "",
    is_featured: false,
    is_published: false,
    is_approved: false,
    is_cancelled: false,
    additional_info: "",
    website_url: "",
    twitter_url: "",
    instagram_url: "",
    youtube_url: "",
    other_information: "",
    ticket_price_min: 0,
    ticket_price_max: 0,
    total_tickets_sold: 0,
    total_tickets_available: 0,
    logo: null,
    background: null,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [successMessage, setSuccessMessage] = useState(null);
  const [logoPreview, setLogoPreview] = useState(null);
  const [backgroundPreview, setBackgroundPreview] = useState(null);

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
      const response = await productionService.store(formData);
      setSuccessMessage(response);
      setTimeout(5000);
    } catch (error) {
      setError("Erro ao criar a produção. Por favor, tente novamente.");
    } finally {
      setLoading(false);
    }
  };



  const handleCnpjChange = async (e) => {
    const cnpj = e.target.value;
    setFormData({ ...formData, cnpj: cnpj });
    try {
      const companyInfo = await productionService.companyInfo(cnpj);
      if (companyInfo && !companyInfo.error) {
        setFormData((prevData) => ({
          ...prevData,
          fantasy: companyInfo.fantasy,
          cep: companyInfo.cep,
          address: `${companyInfo.logradouro} - ${companyInfo.bairro}`,
          uf: companyInfo.uf,
          city: companyInfo.municipio,
        }));
      } else {
        console.error("Erro ao buscar informações do CNPJ:", companyInfo);
      }
    } catch (error) {
      console.error("Erro ao buscar informações do CNPJ:", error);
    }
  };

  const handleSeguimentsChange = (seguimentId) => {
    // Lógica para adicionar/remover o seguimento selecionado da matriz de seguimentos no estado
    const updatedSegments = formData.segments.includes(seguimentId)
      ? formData.segments.filter((id) => id !== seguimentId)
      : [...formData.segments, seguimentId];
    setFormData({ ...formData, segments: updatedSegments });
  };

  // Divide os seguimentos em 6 colunas
  const segmentsPerColumn = 6; // Sempre 6 colunas
  const segmentChunks = Array.from(
    { length: Math.ceil(Object.keys(seguiments).length / segmentsPerColumn) },
    (_, index) =>
      Object.entries(seguiments).slice(
        index * segmentsPerColumn,
        index * segmentsPerColumn + segmentsPerColumn
      )
  );

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
  return (
    <>
      <NavlogComponent />
      
      <p className="labeltitle h2 text-center text-uppercase">Adicionar nova produção</p>
      <label
        htmlFor="BackgroundInput"
        style={{ cursor: "pointer", display: "block" }}
      >
        {backgroundPreview ? (
          <img
            src={backgroundPreview}
            alt="Preview da Background"
            className="img-fluid "
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
        <Row className="justify-content-md-center">
          
          <Col md={12}>
            <Card>
            <p className="labeltitle h4 text-center text-uppercase">Informações básicas</p>
              <Row>
            <Col md={6} className="mt-2">
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

              
            <Col md={3} className="mt-2">
              <Form.Group controlId="formcnpj">
                <Form.Control
                  type="text"
                  name="cnpj"
                  placeholder="CNPJ"
                  value={formData.cnpj}
                  onChange={handleCnpjChange}
                  required
                  className="mt-3"
                />
              </Form.Group>
              </Col>

              
              
            <Col md={3} className="mt-2">
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
              </Row>
              <Row>
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
                    name="website_url"
                    placeholder="URL do website"
                    value={formData.website_url}
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
          <Row className="justify-content-md-center">
            <Col md={12}>
              <Card>
              <p className="labeltitle h4 text-center text-uppercase">Seguimentos</p>
                <Row>
                  {/* Renderiza as 6 colunas */}
                  {segmentChunks.map((chunk, index) => (
                    <React.Fragment key={index}>
                      {chunk.map(([key, value]) => (
                        <Col md={2} key={key}>
                          <Form.Check
                            type="checkbox"
                            label={value.name}
                            checked={formData.segments.includes(key)}
                            onChange={() => handleSeguimentsChange(key)}
                            className="mt-2"
                          />
                        </Col>
                      ))}
                    </React.Fragment>
                  ))}
                </Row>
                
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
      <Link to="/productions">
        <Button
          variant="secondary"
          style={{
            position: "fixed",
            bottom: "50px",
            right: "100px",
            zIndex: "1000",
          }}
        >
          Listar
        </Button>
      </Link>
    </>
  );
};

export default ProductionCreatePage;