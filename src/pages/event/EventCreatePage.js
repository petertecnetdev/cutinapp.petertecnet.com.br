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
import NavlogComponent from "../../components/NavlogComponent";
import eventService from "../../services/EventService";
import { Link, useLocation } from "react-router-dom";
import LoadingComponent from "../../components/LoadingComponent";
import cepUtil from "../../utils/cep";
import seguiments from "../../utils/seguiments";

const EventCreatePage = () => {
  const [formData, setFormData] = useState({
    location: "",
    production_id: "",
    title: "",
    description: "",
    image: null,
    address: "",
    start_date: "",
    end_date: "",
    uf: "",
    cep: "",
    establishment_name:"",
    segments: [],
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [successMessage, setSuccessMessage] = useState(null);
  const [ImagePreview, setImagePreview] = useState(null);
  const [startDateError, setStartDateError] = useState(null);
  const [validated, setValidated] = useState(false);
  const location = useLocation();
  const searchParams = new URLSearchParams(location.search);
  const productionId = searchParams.get("productionId");

  useEffect(() => {
    if (productionId) {
      setFormData({
        ...formData,
        production_id: productionId,
      });
    }
  }, [productionId]);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData({
      ...formData,
      [name]: value,
    });

    if (name === "start_date") {
      const currentDate = new Date();
      const selectedDate = new Date(value);

      if (selectedDate < currentDate) {
        setStartDateError(
          "A data selecionada deve ser posterior à data atual."
        );
      } else {
        setStartDateError(null);
      }
    }

    const form = e.currentTarget;
    if (form.checkValidity() === false) {
      e.preventDefault();
      e.stopPropagation();
    }

    setValidated(true);
  };

  const handleImageChange = (e) => {
    const file = e.target.files[0];
    setFormData({
      ...formData,
      image: file,
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
        canvas.width = 850;
        canvas.height = 480;
        ctx.drawImage(img, 0, 0, 850, 480);
        const resizedDataURL = canvas.toDataURL("image/png");
        setImagePreview(resizedDataURL);
      };
    };
    reader.readAsDataURL(file);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccessMessage(null);

    const form = e.currentTarget;
    if (form.checkValidity() === false) {
      e.stopPropagation();
    } else {
      try {
        const response = await eventService.store(formData);
        setSuccessMessage(response);
        setTimeout(() => {
          setSuccessMessage(null);
        }, 5000);
      } catch (error) {
        setError("Erro ao criar o evento. Por favor, tente novamente.");
      } finally {
        setLoading(false);
      }
    }

    setValidated(true);
  };

  const handleCepChange = async (e) => {
    const cep = e.target.value;
    setFormData({ ...formData, cep: cep });
    try {
      const addressInfo = await cepUtil.getAddressInfo(cep);
      if (addressInfo) {
        setFormData({
          ...formData,
          uf: addressInfo.uf,
          city: addressInfo.cidade,
          address: `${addressInfo.logradouro} - ${addressInfo.bairro}`,
        });
      }
    } catch (error) {
      console.error("Erro ao buscar informações do CEP:", error);
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

  if (loading) {
    return <LoadingComponent />;
  }

  return (
    <>
      <NavlogComponent />
      {error && <Alert variant="danger alert-top">{error}</Alert>}
            {successMessage && (
              <Alert variant="success">{successMessage}</Alert>
            )}
      <div
        className="background-image-event"
        style={{
          backgroundImage: `url(${
            ImagePreview ? ImagePreview : "/images/eventflyer.png"
          })`,
        }}
      />
      <Container>
        <Row>
          <Col md={8} className="mx-auto">
            <Card className="card-event-view ">
              <label
                htmlFor="ImageInput"
                style={{ cursor: "pointer", display: "block" }}
              >
                {ImagePreview ? (
                  <img
                    src={ImagePreview}
                    alt="Preview da Image"
                    className=" img-event"
                  />
                ) : (
                  <img
                    src="/images/eventflyer.png"
                    alt="Preview da Image"
                    className="img-event"
                  />
                )}
              </label>
              <Form.Control
                id="ImageInput"
                type="file"
                accept="image/*"
                onChange={handleImageChange}
                style={{ display: "none" }}
                required
              />
            </Card>
            <Col md={12}>
              <Card>
                <Card.Body>
                <Col md={12}>
                  <Form.Group controlId="formDescription">
                    <Form.Control
                      as="textarea"
                      rows={3}
                      name="description"
                      placeholder="Digite a descrição do evento"
                      className="m-2"
                      value={formData.description}
                      onChange={handleInputChange}
                      required
                    />
                  </Form.Group>
                </Col>
                </Card.Body>
              </Card>
            </Col> 
          </Col>
          <Col md={4}>
            
        <Card>
          <Card.Body>
            <Form
              onSubmit={handleSubmit}
              className={validated ? "was-validated" : ""}
            >
              <Row>
                <Col md={12}>
                  <Form.Group controlId="formTitle">
                    <Form.Control
                      type="text"
                      name="title"
                      placeholder="Nome do evento"
                      value={formData.title}
                      onChange={handleInputChange}
                      className="m-2"
                      required
                    />
                  </Form.Group>
                </Col>
             
                <Col md={12}>
                  <Form.Group controlId="formStartDate">
                    <Form.Label 
                      className="m-2">Data de Início</Form.Label>
                    <Form.Control
                      type="datetime-local"
                      name="start_date"
                      value={formData.start_date}
                      onChange={handleInputChange}
                      className="m-2"
                      required
                      min={new Date().toISOString().split("T")[0]}
                    />
                    <div className="valid-feedback">Válido!</div>
                    {startDateError && (
                      <div className="invalid-feedback">{startDateError}</div>
                    )}
                  </Form.Group>
                </Col>
                <Col md={12}>
                  <Form.Group controlId="formEndDate">
                    <Form.Label 
                      className="m-2">Data de Término</Form.Label>
                    <Form.Control
                      type="datetime-local"
                      name="end_date"
                      value={formData.end_date}
                      onChange={handleInputChange}
                      className="m-2"
                      required
                      min={
                        formData.start_date ||
                        new Date().toISOString().split("T")[0]
                      }
                    />
                  </Form.Group>
                </Col>
                <Col md={12} >
                  <Form.Group controlId="formEstablishmentType">
                    <Form.Label 
                      className=""></Form.Label>
                    <Form.Control
                      as="select"
                      name="establishment_type"
                      value={formData.establishment_type}
                      onChange={handleInputChange}
                      className="m-2"
                      required
                    >
                      <option value="">Tipo de Estabelecimento</option>
                      <option value="Boate">Boate</option>
                      <option value="Restaurante">Restaurante</option>
                      <option value="Bar">Bar</option>
                      <option value="Clube">Clube</option>
                      <option value="Café">Café</option>
                      <option value="Pub">Pub</option>
                      <option value="Lounge">Lounge</option>
                      <option value="Hotel">Hotel</option>
                      <option value="Teatro">Teatro</option>
                      <option value="Cinema">Cinema</option>
                      <option value="Sala de Concertos">
                        Sala de Concertos
                      </option>
                      <option value="Boate">Boate</option>
                      <option value="Academia">Academia</option>
                      <option value="Spa">Spa</option>
                      <option value="Padaria">Padaria</option>
                      <option value="Museu">Museu</option>
                      <option value="Galeria de Arte">Galeria de Arte</option>
                      <option value="Parque">Parque</option>
                      <option value="Praia">Praia</option>
                      <option value="Piscina">Piscina</option>
                      <option value="Cassino">Cassino</option>
                      <option value="Boliche">Boliche</option>
                      <option value="Sinuca">Sinuca</option>
                      <option value="Karaoke">Karaoke</option>
                      <option value="Chácara">Chácara</option>
                      <option value="Secreto">Secreto</option>
                      <option value="Outro">Outro</option>
                    </Form.Control>
                  </Form.Group>
                </Col>
                <Col md={12}>
                  <Form.Group controlId="formEstablishment_name">
                    <Form.Control
                      type="text"
                      name="establishment_name"
                      placeholder="Nome do estabelecimento"
                      value={formData.establishment_name}
                      onChange={handleInputChange}
                      className="m-2"
                      required
                    />
                  </Form.Group>
                </Col>
                <Col md={12}>
                  <Form.Group controlId="formCEP">
                    <Form.Control
                      type="text"
                      name="cep"
                      placeholder="CEP"
                      value={formData.cep}
                      onChange={handleCepChange}
                      className="m-2"
                      required
                    />
                  </Form.Group>
                </Col>
                <Col md={12}>
                  <Form.Group controlId="formLocation">
                    <Form.Control
                      type="text"
                      name="location"
                      placeholder="Url Google Maps"
                      value={formData.location}
                      onChange={handleInputChange}
                      className="m-2"
                      required
                    />
                  </Form.Group>
                </Col>
              
                <Col md={12}>
                  <Form.Group controlId="formAddress">
                    <Form.Control
                      type="text"
                      name="address"
                      placeholder="Endereço"
                      value={formData.address}
                      onChange={handleInputChange}
                      className="m-2"
                      required
                    />
                  </Form.Group>
                </Col>
                <Col md={12}>
                  <Form.Group controlId="formCity">
                    <Form.Control
                      type="text"
                      name="city"
                      placeholder="Cidade"
                      value={formData.city}
                      onChange={handleInputChange}
                      className="m-2"
                      required
                    />
                  </Form.Group>
                </Col>
                <Col md={12}>
                  <Form.Group controlId="formUf">
                    <Form.Control
                      as="select"
                      name="uf"
                      value={formData.uf}
                      onChange={handleInputChange}
                      className="m-2"
                      required
                    >
                      <option value="">UF</option>
                      <option value="">UF</option>
                      <option value="AC">AC</option>
                      <option value="AL">AL</option>
                      <option value="AP">AP</option>
                      <option value="AM">AM</option>
                      <option value="BA">BA</option>
                      <option value="CE">CE</option>
                      <option value="DF">DF</option>
                      <option value="ES">ES</option>
                      <option value="GO">GO</option>
                      <option value="MA">MA</option>
                      <option value="MT">MT</option>
                      <option value="MS">MS</option>
                      <option value="MG">MG</option>
                      <option value="PA">PA</option>
                      <option value="PB">PB</option>
                      <option value="PR">PR</option>
                      <option value="PE">PE</option>
                      <option value="PI">PI</option>
                      <option value="RJ">RJ</option>
                      <option value="RN">RN</option>
                      <option value="RS">RS</option>
                      <option value="RO">RO</option>
                      <option value="RR">RR</option>
                      <option value="SC">SC</option>
                      <option value="SP">SP</option>
                      <option value="SE">SE</option>
                      <option value="TO">TO</option>
                    </Form.Control>
                  </Form.Group>
                </Col>
                
       
              </Row>
          
            </Form>
          
          </Card.Body>
        </Card>
          </Col>
                <Col md={12}>
              <Card>
                <Card.Title>Seguimentos</Card.Title>
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
            <Link to={`/productions/${productionId}`}>
        <Button variant="secondary">Voltar para Produção</Button>
      </Link>
        </Row>
      
      </Container>
     
    </>
  );
};

export default EventCreatePage;
