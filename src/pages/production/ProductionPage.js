import React, { useEffect, useState } from "react";
import { Container, Row, Col, Card, } from "react-bootstrap";
import { Link } from "react-router-dom";
import NavlogComponent from "../../components/NavlogComponent";
import productionService from "../../services/ProductionService";
import { storageUrl } from "../../config";

const ProductionPage = () => {
  const [productions, setProductions] = useState([]);

 

  useEffect(() => {
    const fetchProductions = async () => {
      try {
        const fetchedProductions = await productionService.list();
        setProductions(fetchedProductions);
      } catch (error) {
        console.error("Error fetching productions:", error);
      }
    };

    fetchProductions();
  }, []);

  return (
    <div>
    <NavlogComponent />
      <Container>
      <Row>
  <p className="labeltitle h2 text-center text-uppercase">Produções</p>
  {productions.map((production) => (
    
    <Col key={production.id} md={4} className="p-4">
   
      
   <Card className="card-production-show" >
                      <div
    className="background-image"
    style={{
      backgroundImage: `url('${storageUrl}/${production.background}')`,
    }}
  />
                    <Link
        to={`/production/${production.slug}`}
        style={{ textDecoration: "none" }}
      > <img
      src={`${storageUrl}/${production.logo}`}
      className="rounded-circle img-logo-production-show"
      style={{ margin: '0 auto', display: 'block' }}
    />
    
                    </Link>
                    <Card.Body>
                      <Link
                        to={`/production/${production.slug}`}
                        style={{ textDecoration: "none" }}
                      >
                        <Card.Title className="text-uppercase text-center labeltitle">
                          {production.name}
                        </Card.Title>
                      </Link>
                    </Card.Body>
                  </Card>
    </Col>
  ))}
</Row>

      </Container>
    </div>
  );
};

export default ProductionPage;
