import React from "react";
import ProcessingIndicatorComponent from "./ProcessingIndicatorComponent";

export default function LoadingComponent() {
  return (
    <ProcessingIndicatorComponent
      messages={["Carregando...", "Preparando sua experiência..."]}
    />
  );
}
