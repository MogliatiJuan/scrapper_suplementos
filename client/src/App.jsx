import  { useState } from "react";
import axios from "axios";
import "./App.css";

function App() {
  const [loading, setLoading] = useState({ excel: false, pdf: false });

  const handleDownload = async (type) => {
    setLoading({ excel: type === "excel", pdf: type === "pdf" });

    const endpoint =
      type === "excel"
        ? "http://localhost:4000/api/update-prices"
        : "http://localhost:4000/api/update-prices-pdf";

    try {
      const { data } = await axios.get(endpoint, {
        responseType: "blob",
      });

      const url = window.URL.createObjectURL(new Blob([data]));
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute(
        "download",
        type === "excel" ? "precios.xlsx" : "precios.pdf"
      );
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (error) {
      console.error(error);
      alert(`Error al generar el ${type === "excel" ? "Excel" : "PDF"}`);
    } finally {
      setLoading({ excel: false, pdf: false });
    }
  };

  return (
    <div className="container">
      <h1>Actualizador de Precios</h1>
      <div className="button-group">
        <button
          className="btn"
          onClick={() => handleDownload("excel")}
          disabled={loading.excel || loading.pdf}
        >
          {loading.excel ? "Generando Excel..." : "Descargar Excel"}
        </button>
        <button
          className="btn"
          onClick={() => handleDownload("pdf")}
          disabled={loading.pdf || loading.excel}
        >
          {loading.pdf ? "Generando PDF..." : "Descargar PDF"}
        </button>
      </div>
    </div>
  );
}

export default App;
