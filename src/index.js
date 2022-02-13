import React from "react";
import ReactDOM from "react-dom";
import ServiceMap from "./map";
import { default as serviceMapData } from "./data";
import "./styles.css";

function App() {
  return <ServiceMap data={serviceMapData.data} />;
}

const rootElement = document.getElementById("root");
ReactDOM.render(<App />, rootElement);
