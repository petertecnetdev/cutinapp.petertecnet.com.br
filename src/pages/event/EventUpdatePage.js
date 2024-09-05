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
import eventService from "../../services/EventService";
import NavlogComponent from "../../components/NavlogComponent";
import { useParams, Link } from "react-router-dom";
import LoadingComponent from "../../components/LoadingComponent";
import seguiments from "../../utils/seguiments";
import { storageUrl } from "../../config";
import cepUtil from "../../utils/cep";

const EventUpdatePage = () => {
  const { id } = useParams();
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
    establishment_type:"",
    segments: [], // Initialize segments as an empty array
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [successMessage, setSuccessMessage] = useState(null);
  const [flyerPreview, setFlyerPreview] = useState(null);
  const [startDateError, setStartDateError] = useState(null);
  const [validated, setValidated] = useState(false);

  useEffect(() => {
    const fetchEvent = async () => {
      try {
        const event = await eventService.show(id);
        if (event && event.title) {
          setFormData(event);
          if (event.image) {
            setFlyerPreview(`${storageUrl}/${event.image}`);
          }
        } else {
          setError("Evento não encontrado.");
        }
      } catch (error) {
        setError("Erro ao carregar informações do evento.");
      }
    };

    fetchEvent();
  }, [id]);

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

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const response = await eventService.update(id, formData);
      setSuccessMessage(response);
      setTimeout(() => setSuccessMessage(null), 5000);
    } catch (error) {
      setError("Erro ao atualizar o evento. Por favor, tente novamente.");
    } finally {
      setLoading(false);
    }
  };

  const handleBackgroundChange = (e) => {
    const file = e.target.files[0];
    setFormData({
      ...formData,
      image: file, // Atualiza o estado com a chave correta
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
        canvas.height = 450;
        ctx.drawImage(img, 0, 0, 850, 450);
        const resizedDataURL = canvas.toDataURL("image/png");
        setFlyerPreview(resizedDataURL); // Set the flyer preview
      };
    };
    reader.readAsDataURL(file);
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
  if (loading) {
    return <LoadingComponent />;
  }
  const handleSeguimentsChange = (seguimentId) => {
    const updatedSegments =
      formData.segments && formData.segments.includes(seguimentId)
        ? formData.segments.filter((id) => id !== seguimentId)
        : [...(formData.segments || []), seguimentId];
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
      <div
        className="background-image-event"
        style={{
          backgroundImage: `url(${
            flyerPreview ? flyerPreview : "/images/eventflyer.png"
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
                {flyerPreview ? (
                  <img
                    src={flyerPreview}
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
                onChange={handleBackgroundChange}
                style={{ display: "none" }}
                required
              />
            </Card>
            <Col md={12}>
            <Card>
              
                      <Form.Group controlId="formDescription">
                        <Form.Label className="m-1">Descrição</Form.Label>
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
            </Card>
          </Col>
        
          </Col>
          <Col md={4}>
            <Card>
            <Link
                          to={`/event/${formData.slug}`}
                          style={{
                            textDecoration: "none",
                            color: "white",
                            textTransform: "uppercase",
                          }}
                        >
                  <p className="labeltitle h6 text-center text-uppercase">
                   Pagina do evento
                  </p>
                  </Link>
                  <Link
                          to={`/event/${formData.id}/items`}
                          style={{
                            textDecoration: "none",
                            color: "white",
                            textTransform: "uppercase",
                          }}
                        >
                  <p className="labeltitle bg-primary h6 text-center text-uppercase">
                Itens
                  </p>
                  </Link>
              <Card.Body>
                <Form
                  onSubmit={handleSubmit}
                  className={validated ? "was-validated" : ""}
                >
                  <Row>
                    <Col md={12}>
                      <Form.Group controlId="formTitle">
                        <Form.Label className="m-1">Nome do evento</Form.Label>
                        <Form.Control
                          type="text"
                          name="title"
                          placeholder="Digite o nome do evento"
                          value={formData.title}
                          onChange={handleInputChange}
                          className=""
                          required
                        />
                      </Form.Group>
                    </Col>

                    <Col md={12}>
                      <Form.Group controlId="formStartDate">
                        <Form.Label className="m-1">Data de Início</Form.Label>
                        <Form.Control
                          type="datetime-local"
                          name="start_date"
                          value={formData.start_date}
                          onChange={handleInputChange}
                          className=""
                          required
                          min={new Date().toISOString().split("T")[0]}
                        />
                        <div className="valid-feedback">Válido!</div>
                        {startDateError && (
                          <div className="invalid-feedback">
                            {startDateError}
                          </div>
                        )}
                      </Form.Group>
                    </Col>
                    <Col md={12}>
                      <Form.Group controlId="formEndDate">
                        <Form.Label className="m-1">Data de Término</Form.Label>
                        <Form.Control
                          type="datetime-local"
                          name="end_date"
                          value={formData.end_date}
                          onChange={handleInputChange}
                          className=""
                          required
                          min={
                            formData.start_date ||
                            new Date().toISOString().split("T")[0]
                          }
                        />
                      </Form.Group>
                    </Col>
                    <Col md={12}>
                      <Form.Group controlId="formEstablishmentType">
                        <Form.Label className="m-1">Estabelecimento</Form.Label>
                        <Form.Control
                          as="select"
                          name="establishment_type"
                          value={formData.establishment_type}
                          onChange={handleInputChange}
                          className=""
                          required
                        >
                          <option value="">Estabelecimento</option>
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
                          <option value="Galeria de Arte">
                            Galeria de Arte
                          </option>
                          <option value="Parque">Parque</option>
                          <option value="Praia">Praia</option>
                          <option value="Piscina">Piscina</option>
                          <option value="Cassino">Cassino</option>
                          <option value="Boliche">Boliche</option>
                          <option value="Sinuca">Sinuca</option>
                          <option value="Karaoke">Karaoke</option>
                          <option value="Karaoke">Outro</option>
                        </Form.Control>
                      </Form.Group>
                    </Col>
                    
                <Col md={12}>
                  <Form.Group controlId="formEstablishment_name">
                        <Form.Label className="m-1">Nome do estabelecimento</Form.Label>
                    <Form.Control
                      type="text"
                      name="establishment_name"
                      placeholder="Nome do estabelecimento"
                      value={formData.establishment_name}
                      onChange={handleInputChange}
                      className=""
                      required
                    />
                  </Form.Group>
                </Col>
                    <Col md={12}>
                      <Form.Group controlId="formLocation">
                        <Form.Label className="m-1">Url Google Maps</Form.Label>
                        <Form.Control
                          type="text"
                          name="location"
                          placeholder="Url Google Maps"
                          value={formData.location}
                          onChange={handleInputChange}
                          className=""
                          required
                        />
                      </Form.Group>
                    </Col>

                    <Col md={12}>
                      <Form.Group controlId="formCEP">
                        <Form.Label className="m-1">CEP</Form.Label>
                        <Form.Control
                          type="text"
                          name="cep"
                          placeholder="Digite o CEP"
                          value={formData.cep}
                          onChange={handleCepChange}
                          className=""
                          required
                        />
                      </Form.Group>
                    </Col>
                    <Col md={12}>
                      <Form.Group controlId="formAddress">
                        <Form.Label className="m-1">Endereço</Form.Label>
                        <Form.Control
                          type="text"
                          name="address"
                          placeholder="Digite o endereço do evento"
                          value={formData.address}
                          onChange={handleInputChange}
                          className=""
                          required
                        />
                      </Form.Group>
                    </Col>
                    <Col md={7}>
                      <Form.Group controlId="formCity">
                        <Form.Label className="m-1">Cidade</Form.Label>
                        <Form.Control
                          type="text"
                          name="city"
                          placeholder="Digite a cidade"
                          value={formData.city}
                          onChange={handleInputChange}
                          className=""
                          required
                        />
                      </Form.Group>
                    </Col>
                    <Col md={5}>
                      <Form.Group controlId="formUf">
                        <Form.Label className="m-1">UF</Form.Label>
                        <Form.Control
                          as="select"
                          name="uf"
                          value={formData.uf}
                          onChange={handleInputChange}
                          className=""
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
                                      checked={
                                        formData.segments &&
                                        formData.segments.includes(key)
                                      }
                                      onChange={() =>
                                        handleSeguimentsChange(key)
                                      }
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
      <Link to={`/event/corp/list`}>
        <Button
          variant="secondary"
          disabled={loading}
          style={{
            position: "fixed",
            bottom: "20px",
            right: "20px",
            zIndex: "1050",
          }}
        >
          Voltar
        </Button>
      </Link>
    </>
  );
};

export default EventUpdatePage;
