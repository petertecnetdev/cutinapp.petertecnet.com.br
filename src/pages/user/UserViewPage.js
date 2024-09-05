import React, { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { Container, Row, Col, Card } from "react-bootstrap";
import NavlogComponent from "../../components/NavlogComponent";
import userService from "../../services/UserService";
import LoadingComponent from "../../components/LoadingComponent";
import { storageUrl } from "../../config";
import { Link } from "react-router-dom";

const UserViewPage = () => {
  const { userName } = useParams();
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchUser = async () => {
      try {
        if (!userName) {
          throw new Error("Nome de usuário não fornecido.");
        }

        const response = await userService.view(userName);
        setUser(response.user);
        setLoading(false);
      } catch (error) {
        console.error("Erro ao buscar usuário:", error);
        setLoading(false);
      }
    };

    fetchUser();
  }, [userName]);

  const calculateAge = (birthdate) => {
    const today = new Date();
    const birthDate = new Date(birthdate);
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
      age--;
    }
    return age;
  };

  if (loading) {
    return <LoadingComponent />;
  }

  return (
    <>
      <NavlogComponent />
      <Container>
        <Row>
          <Col md={12}>
            <Row>
             
              <Col md={7} >
                <Card className="card-user">
                  <Card.Body>
                    {user && (
                      <>
                        <Card.Text>
                          <p className=" h6 text-center">
                            <strong> {user.about} </strong>
                          </p>{" "}
                          <br />
                          <strong>Artista Favorito:</strong>{" "}
                          {user.favorite_artist} <br />
                          <strong>Gênero Favorito:</strong>{" "}
                          {user.favorite_genre} <br />
                        </Card.Text>
                      </>
                    )}
                  </Card.Body>
                </Card>
              </Col>
              <Col md={5}>
                <Card className="card-user">
                  <Card.Body>
                    {user && (
                      <>
                        <Card.Text className="mb-2">
                          <div className="text-center">
                            <img
                              src={
                                user.avatar
                                  ? `${storageUrl}/${user.avatar}`
                                  : "/images/loadingimage.gif"
                              }
                              alt={`${user.first_name} ${
                                user.last_name ? user.last_name : ""
                              }`}
                              className="rounded-circle "
                              
                            style={{ maxWidth: "250px", borderRadius: "250%" }}
                             
                            />
                          </div>
                          <br />
                          <strong>Nome:</strong> {user.first_name} {user.last_name} <br />
                       
                          <strong>Email:</strong> {user.email} <br />
                       
                          <strong>CPF:</strong> {user.cpf} <br />
                          <strong>Endereço:</strong> {user.address} <br />
                          <strong>Telefone:</strong> {user.phone} <br />
                          <strong>Cidade:</strong> {user.city} <br />
                          <strong>UF:</strong> {user.uf} <br />
                          <strong>Idade:</strong> {calculateAge(user.birthdate)} anos <br />
                          <strong>Gênero:</strong> {user.gender} <br />
                          <strong>Estado Civil:</strong> {user.marital_status}{" "}
                          <br />
                          <strong>Profissão:</strong> {user.occupation} <br />
                        </Card.Text>
                      </>
                    )}
                  </Card.Body>
                </Card>
              </Col>
            </Row>
            <Row>
          {user.productions.map((production) => (
            <Col key={production.id} md={4}>
              <Link
                to={`/production/${production.slug}`}
                style={{ textDecoration: "none" }}
              >
                 <Card>
                <Card.Img
                  variant="top"
                  src={`${storageUrl}/${production.logo}`}
                  className="rounded-circle"
                />
                <Card.Body>
                  <Card.Title>{production.name}</Card.Title>
                </Card.Body>
              </Card>
              </Link>
            </Col>
          ))}
        </Row>
          </Col>
        </Row>
      </Container>
    </>
  );
};

export default UserViewPage;
