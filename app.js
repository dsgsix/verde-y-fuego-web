"use strict";

// Configuración del negocio. Usa el QR oficial de cobro emitido por Pichincha o Deuna, sin monto fijo.
const CONFIG = {
  whatsapp: "593979232200",
  qrPichincha: "", // Agrega el archivo oficial y usa "./assets/qr-pichincha.png".
  entregaCentavos: null, // null: por confirmar. Usa 0 para entrega gratuita o un valor fijo en centavos.
};

// Los importes se guardan en centavos para sumar sin redondeos intermedios.
const PRODUCTOS = [
  { id: "bolon-mixto", categoria: "bolones", nombre: "Bolón mixto", descripcion: "Verde majado con queso fresco y chicharrón crujiente.", precio: 375 },
  { id: "bolon-chicharron", categoria: "bolones", nombre: "Bolón de chicharrón", descripcion: "Verde majado con trocitos dorados de chicharrón.", precio: 325 },
  { id: "bolon-queso", categoria: "bolones", nombre: "Bolón de queso", descripcion: "Plátano verde majado con un centro de queso fresco.", precio: 275 },
  { id: "tigrillo", categoria: "tigrillos", nombre: "Tigrillo", descripcion: "Verde majado y salteado con huevo revuelto y queso fresco.", precio: 425 },
  { id: "empanadas", categoria: "antojos", nombre: "Empanada de verde", descripcion: "Masa de plátano verde dorada, rellena de queso fresco. Precio por unidad.", precio: 175 },
  { id: "corviches", categoria: "antojos", nombre: "Corviche", descripcion: "Masa de verde con maní y un relleno de pescado sazonado. Precio por unidad.", precio: 225 },
];

const METODOS = {
  retiro: { nombre: "Retiro en local", ayuda: "Puedes indicar cuándo pasarás. Horario de Manabí, Ecuador." },
  entrega: { nombre: "Entrega a domicilio", ayuda: "Indica la fecha, la hora y la dirección. Horario de Manabí, Ecuador." },
  reserva: { nombre: "Reserva en local", ayuda: "Indica la fecha y la hora de tu reserva. Horario de Manabí, Ecuador." },
};

const CLAVE_CARRITO = "verde-y-fuego:pedido:v1";
const CANTIDAD_MAXIMA = 99;
const monedaUSD = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
const relojManabi = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Guayaquil", year: "numeric", month: "2-digit", day: "2-digit",
  hour: "2-digit", minute: "2-digit", hourCycle: "h23",
});
const formatoFecha = new Intl.DateTimeFormat("es-EC", { dateStyle: "long", timeZone: "UTC" });
const formatoEmision = new Intl.DateTimeFormat("es-EC", {
  dateStyle: "medium", timeStyle: "short", timeZone: "America/Guayaquil",
});
const agendaOpcional = document.querySelectorAll(".optional-schedule");
const $ = (id) => document.getElementById(id);
const moneda = (centavos) => monedaUSD.format(centavos / 100);
const foto = (id) => `./assets/platos/${id}.webp`;

const menu = $("menu-grid");
const filtros = $("menu-filters");
const formulario = $("order-form");
const listaCarrito = $("cart-items");
const panel = $("cart-drawer");
const fecha = $("order-date");
const hora = $("order-time");
const direccion = $("order-address");
const notas = $("order-notes");
const pago = $("payment");
const enviarPedido = $("send-order");
const imagenQR = $("qr-image");
const descargarPedido = $("download-receipt");
let qrDisponible = false;
let comprobante;

function leerCarrito() {
  try {
    const guardado = JSON.parse(localStorage.getItem(CLAVE_CARRITO) || "{}");
    return new Map(PRODUCTOS.filter(({ id }) => Number.isInteger(guardado?.[id]) && guardado[id] > 0)
      .map(({ id }) => [id, Math.min(guardado[id], CANTIDAD_MAXIMA)]));
  } catch {
    return new Map();
  }
}

let carrito = leerCarrito();

function guardarCarrito() {
  try {
    localStorage.setItem(CLAVE_CARRITO, JSON.stringify(Object.fromEntries(carrito)));
  } catch {
    // El pedido sigue disponible en memoria si el navegador bloquea el almacenamiento.
  }
}

function crearCatalogo() {
  const plantilla = $("product-template");
  const tarjetas = PRODUCTOS.map((producto) => {
    const tarjeta = plantilla.content.firstElementChild.cloneNode(true);
    tarjeta.dataset.category = producto.categoria;
    tarjeta.querySelector("img").src = foto(producto.id);
    tarjeta.querySelector("h3").textContent = producto.nombre;
    tarjeta.querySelector("p").textContent = producto.descripcion;
    tarjeta.querySelector(".product-price").textContent = moneda(producto.precio);
    const boton = tarjeta.querySelector("button");
    boton.dataset.add = producto.id;
    boton.setAttribute("aria-label", `Agregar ${producto.nombre} al pedido`);
    return tarjeta;
  });
  menu.append(...tarjetas);
}

function metodoActual() {
  return formulario.elements.method.value;
}

function productosEnCarrito() {
  return PRODUCTOS.filter(({ id }) => carrito.has(id));
}

function calcularTotales() {
  const subtotal = productosEnCarrito().reduce((suma, producto) => suma + producto.precio * carrito.get(producto.id), 0);
  const entrega = metodoActual() === "entrega";
  const tarifa = entrega ? CONFIG.entregaCentavos : 0;
  return { subtotal, entrega, tarifa, total: subtotal + (tarifa ?? 0) };
}

function mostrarTotales() {
  const { subtotal, entrega, tarifa, total } = calcularTotales();
  $("subtotal").textContent = moneda(subtotal);
  $("delivery-total-line").hidden = !entrega;
  $("delivery-total").textContent = tarifa === null ? "Por confirmar" : moneda(tarifa);
  $("total-label").textContent = tarifa === null ? "Total de productos" : "Total";
  $("total").textContent = moneda(total);
}

function mostrarCarrito() {
  const productos = productosEnCarrito();
  const unidades = productos.reduce((suma, { id }) => suma + carrito.get(id), 0);
  $("cart-count").textContent = unidades;
  $("open-cart").setAttribute("aria-label", `Mi pedido, ${unidades} ${unidades === 1 ? "producto" : "productos"}`);
  $("empty-cart").hidden = unidades > 0;
  formulario.hidden = unidades === 0;
  $("drawer-footer").hidden = unidades === 0;

  const plantilla = $("cart-item-template");
  listaCarrito.replaceChildren(...productos.map((producto) => {
    const fila = plantilla.content.firstElementChild.cloneNode(true);
    const cantidad = carrito.get(producto.id);
    fila.dataset.item = producto.id;
    fila.querySelector("img").src = foto(producto.id);
    fila.querySelector("h3").textContent = producto.nombre;
    fila.querySelector("p").textContent = moneda(producto.precio * cantidad);
    fila.querySelector(".item-quantity").textContent = cantidad;
    fila.querySelectorAll("button").forEach((boton) => {
      boton.setAttribute("aria-label", `${boton.dataset.action === "eliminar" ? "Quitar" : boton.dataset.action} ${producto.nombre}`);
    });
    fila.querySelector('[data-action="sumar"]').disabled = cantidad >= CANTIDAD_MAXIMA;
    return fila;
  }));
  mostrarTotales();
}

function actualizarCantidad(id, cantidad) {
  if (cantidad > CANTIDAD_MAXIMA) {
    $("site-status").textContent = `Puedes agregar hasta ${CANTIDAD_MAXIMA} unidades por plato.`;
    return false;
  }
  if (cantidad > 0) carrito.set(id, cantidad);
  else carrito.delete(id);
  guardarCarrito();
  cerrarPago();
  mostrarCarrito();
  return true;
}

function actualizarCampos() {
  const metodo = metodoActual();
  const esEntrega = metodo === "entrega";
  $("method-hint").textContent = METODOS[metodo].ayuda;
  $("address-field").hidden = !esEntrega;
  direccion.required = esEntrega;
  direccion.disabled = !esEntrega;
  agendaOpcional.forEach((etiqueta) => { etiqueta.hidden = metodo !== "retiro"; });
  actualizarValidez();
}

function actualizarValidez() {
  // Compara fecha y hora con el reloj de Manabí, independientemente del dispositivo.
  const partes = Object.fromEntries(relojManabi.formatToParts(new Date()).map(({ type, value }) => [type, value]));
  const hoy = `${partes.year}-${partes.month}-${partes.day}`;
  const ahora = `${partes.hour}:${partes.minute}`;
  const requiereHorario = metodoActual() !== "retiro";
  fecha.min = hoy;
  fecha.required = requiereHorario || Boolean(hora.value);
  hora.required = requiereHorario || Boolean(fecha.value);
  fecha.setCustomValidity(fecha.value && fecha.value < hoy ? "Elige la fecha de hoy o una fecha futura." : "");
  hora.setCustomValidity(fecha.value === hoy && hora.value && hora.value <= ahora ? "Elige una hora posterior a la actual en Manabí." : "");
  direccion.setCustomValidity(direccion.required && !direccion.value.trim() ? "Escribe la dirección de entrega." : "");
}

function validarPedido() {
  actualizarValidez();
  return carrito.size > 0 && formulario.reportValidity();
}

function detallarPedido() {
  const metodo = metodoActual();
  const { subtotal, entrega, tarifa, total } = calcularTotales();
  const productos = productosEnCarrito().map(({ id, nombre, precio }) => {
    const unidades = carrito.get(id);
    return `${unidades} × ${nombre} — ${moneda(precio * unidades)}`;
  });
  const detalles = [`Modalidad: ${METODOS[metodo].nombre}`];
  if (fecha.value && hora.value) {
    const dia = formatoFecha.format(new Date(`${fecha.value}T00:00:00Z`));
    detalles.push(`Fecha y hora: ${dia}, ${hora.value} (hora de Manabí)`);
  } else {
    detalles.push("Horario: por coordinar");
  }
  if (entrega) detalles.push(`Dirección: ${direccion.value.trim()}`);
  if (notas.value.trim()) detalles.push(`Notas: ${notas.value.trim()}`);
  const importes = [`Subtotal: ${moneda(subtotal)}`];
  if (entrega) importes.push(`Entrega: ${tarifa === null ? "por confirmar" : moneda(tarifa)}`);
  importes.push(`${tarifa === null ? "Total de productos" : "Total"}: ${moneda(total)} USD`);
  return { productos, detalles, importes };
}

function mostrarPago() {
  const { tarifa, total } = calcularTotales();
  const puedeTransferir = tarifa !== null && qrDisponible;
  let instrucciones = "El QR de cobro está pendiente. Solicítalo al negocio por WhatsApp.";
  let mensajePago = "¿Me comparten el QR oficial de cobro? Si ya transferí, adjuntaré el comprobante bancario en este chat.";
  let accion = "Consultar pago por WhatsApp";
  if (tarifa === null) {
    instrucciones = "Confirma el costo de entrega por WhatsApp antes de transferir.";
    mensajePago = "¿Me confirman el costo de entrega y el total a transferir?";
    accion = "Consultar total por WhatsApp";
  } else if (puedeTransferir) {
    instrucciones = `Escanea el QR con Banca Móvil Pichincha o Deuna y transfiere ${moneda(total)} USD.`;
    mensajePago = "Compartiré el comprobante bancario de la transferencia en este chat para su revisión.";
    accion = "Enviar comprobante por WhatsApp";
  }
  $("payment-instructions").textContent = instrucciones;
  $("payment-qr").hidden = !puedeTransferir;
  enviarPedido.textContent = accion;

  const { referencia, pedido: { productos, detalles, importes } } = comprobante;
  const mensaje = [
    "*Pedido — Verde & Fuego*", `*Referencia:* ${referencia}`, "",
    "*Productos*", ...productos.map((producto) => `• ${producto}`), "",
    ...detalles, "", ...importes, "Pago: transferencia por QR Banco Pichincha / Deuna", "", mensajePago,
  ].join("\n");
  enviarPedido.href = `https://wa.me/${CONFIG.whatsapp}?text=${encodeURIComponent(mensaje)}`;
}

function abrirPago() {
  const pedido = detallarPedido();
  if (JSON.stringify(comprobante?.pedido) !== JSON.stringify(pedido)) {
    const bytes = crypto.getRandomValues(new Uint8Array(6));
    const codigo = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
    comprobante = { referencia: `VF-${codigo.toUpperCase()}`, fechaEmision: formatoEmision.format(new Date()), pedido };
  }
  $("receipt-reference").textContent = comprobante.referencia;
  $("payment-status").textContent = "";
  mostrarPago();
  pago.hidden = false;
  $("checkout-button").hidden = true;
  enviarPedido.hidden = false;
  $("payment-title").focus({ preventScroll: true });
  pago.scrollIntoView({ block: "start" });
}

function cerrarPago() {
  pago.hidden = true;
  $("checkout-button").hidden = false;
  enviarPedido.hidden = true;
  enviarPedido.removeAttribute("href");
}

function ajustarTexto(ctx, texto, ancho) {
  const lineas = [];
  let linea = "";
  for (const caracter of texto) {
    if (caracter === "\n") {
      lineas.push(linea.trim());
      linea = "";
      continue;
    }
    if (ctx.measureText(linea + caracter).width > ancho) {
      const corte = linea.lastIndexOf(" ");
      lineas.push(corte > 0 ? linea.slice(0, corte) : linea);
      linea = corte > 0 ? linea.slice(corte + 1) : "";
    }
    linea += caracter;
  }
  lineas.push(linea.trim());
  return lineas;
}

function dibujarComprobante({ referencia, fechaEmision, pedido }) {
  const lienzo = document.createElement("canvas");
  const ctx = lienzo.getContext("2d");
  const margen = 52;
  const altoLinea = 35;
  const fuenteTexto = "25px sans-serif";
  lienzo.width = 840;
  ctx.font = fuenteTexto;
  const anchoTexto = lienzo.width - margen * 2;
  const secciones = [
    ["PRODUCTOS", pedido.productos], ["DETALLES DEL PEDIDO", pedido.detalles], ["IMPORTES", pedido.importes],
  ].map(([titulo, textos]) => ({ titulo, lineas: textos.flatMap((texto) => ajustarTexto(ctx, texto, anchoTexto)) }));
  const altoSecciones = secciones.reduce((alto, { lineas }) => alto + 59 + lineas.length * altoLinea, 0);
  lienzo.height = 324 + altoSecciones;

  ctx.fillStyle = "#f8f6ee";
  ctx.fillRect(0, 0, lienzo.width, lienzo.height);
  ctx.fillStyle = "#15291e";
  ctx.fillRect(0, 0, lienzo.width, 231);
  ctx.fillStyle = "#fff6e2";
  ctx.font = "bold 42px Georgia, serif";
  ctx.fillText("Verde & Fuego", margen, 68);
  ctx.font = "bold 28px sans-serif";
  ctx.fillText("Comprobante de pedido", margen, 111);
  ctx.font = fuenteTexto;
  ctx.fillText(`Referencia: ${referencia}`, margen, 153);
  ctx.fillStyle = "#f8a16d";
  ctx.fillText("Pago pendiente de verificación", margen, 188);

  let y = 278;
  secciones.forEach(({ titulo, lineas }) => {
    ctx.fillStyle = "#963f1c";
    ctx.font = "bold 20px sans-serif";
    ctx.fillText(titulo, margen, y);
    ctx.fillStyle = "#17291e";
    ctx.font = fuenteTexto;
    y += 35;
    lineas.forEach((linea) => {
      ctx.fillText(linea, margen, y);
      y += altoLinea;
    });
    y += 24;
  });
  ctx.fillStyle = "#555e50";
  ctx.font = "21px sans-serif";
  ctx.fillText(`Emitido: ${fechaEmision} (hora de Manabí)`, margen, y);
  return lienzo;
}

function descargarComprobante() {
  if (pago.hidden || !validarPedido()) return;
  const recibo = comprobante;
  const lienzo = dibujarComprobante(recibo);
  descargarPedido.disabled = true;
  lienzo.toBlob((archivo) => {
    descargarPedido.disabled = false;
    if (!archivo) {
      $("payment-status").textContent = "No se pudo descargar el comprobante. Inténtalo de nuevo.";
      return;
    }
    const enlace = document.createElement("a");
    enlace.href = URL.createObjectURL(archivo);
    enlace.download = `verde-y-fuego-${recibo.referencia}.png`;
    document.body.append(enlace);
    enlace.click();
    enlace.remove();
    setTimeout(() => URL.revokeObjectURL(enlace.href), 30_000);
    if (comprobante === recibo && !pago.hidden) $("payment-status").textContent = "Descarga iniciada.";
  }, "image/png");
}

$("open-cart").addEventListener("click", () => {
  actualizarCampos();
  panel.showModal();
  $("drawer-body").scrollTop = 0;
  $("cart-title").focus({ preventScroll: true });
});
$("close-cart").addEventListener("click", () => panel.close());
$("empty-menu-link").addEventListener("click", () => panel.close());
panel.addEventListener("click", (evento) => {
  if (evento.target === panel) panel.close();
});
panel.addEventListener("close", cerrarPago);

filtros.addEventListener("click", (evento) => {
  const boton = evento.target.closest("[data-filter]");
  if (!boton || boton.getAttribute("aria-pressed") === "true") return;
  filtros.querySelector('[aria-pressed="true"]').setAttribute("aria-pressed", "false");
  boton.setAttribute("aria-pressed", "true");
  let visibles = 0;
  Array.from(menu.children).forEach((tarjeta) => {
    tarjeta.hidden = boton.dataset.filter !== "todos" && tarjeta.dataset.category !== boton.dataset.filter;
    if (!tarjeta.hidden) visibles += 1;
  });
  $("menu-results").textContent = `${visibles} ${visibles === 1 ? "plato disponible" : "platos disponibles"}.`;
  actualizarAnimacionesCatalogo();
});

const avisosDeBoton = new WeakMap();
menu.addEventListener("click", (evento) => {
  const boton = evento.target.closest("[data-add]");
  if (!boton) return;
  const id = boton.dataset.add;
  const cantidad = (carrito.get(id) || 0) + 1;
  if (!actualizarCantidad(id, cantidad)) return;
  const producto = PRODUCTOS.find((item) => item.id === id);
  $("site-status").textContent = `${producto.nombre} agregado. ${cantidad} en tu pedido.`;
  boton.classList.add("is-added");
  boton.lastChild.textContent = " Agregado";
  clearTimeout(avisosDeBoton.get(boton));
  avisosDeBoton.set(boton, setTimeout(() => {
    boton.classList.remove("is-added");
    boton.lastChild.textContent = " Agregar al pedido";
  }, 1050));
});

listaCarrito.addEventListener("click", (evento) => {
  const boton = evento.target.closest("[data-action]");
  if (!boton) return;
  const id = boton.closest("[data-item]").dataset.item;
  const { action } = boton.dataset;
  const cambio = action === "sumar" ? 1 : -1;
  const cantidad = action === "eliminar" ? 0 : carrito.get(id) + cambio;
  if (!actualizarCantidad(id, cantidad)) return;
  const nuevoBoton = listaCarrito.querySelector(`[data-item="${id}"] [data-action="${action}"]:enabled`);
  const disponible = listaCarrito.querySelector(".quantity-controls button:enabled");
  (nuevoBoton || disponible || $("empty-menu-link")).focus({ preventScroll: true });
});

formulario.addEventListener("change", (evento) => {
  if (evento.target.name !== "method") return;
  actualizarCampos();
  mostrarTotales();
});
formulario.addEventListener("input", () => {
  actualizarValidez();
  cerrarPago();
});
formulario.addEventListener("submit", (evento) => {
  evento.preventDefault();
  if (validarPedido()) abrirPago();
});
descargarPedido.addEventListener("click", descargarComprobante);
enviarPedido.addEventListener("click", (evento) => {
  if (!validarPedido()) evento.preventDefault();
});

window.addEventListener("storage", (evento) => {
  if (evento.key !== CLAVE_CARRITO && evento.key !== null) return;
  carrito = leerCarrito();
  cerrarPago();
  mostrarCarrito();
});

// GSAP mejora la presentación. El contenido y el pedido funcionan si falla el CDN.
let actualizarAnimacionesCatalogo = () => {};

function iniciarAnimaciones() {
  const { gsap, ScrollTrigger } = window;
  if (!gsap || !ScrollTrigger) return;
  gsap.registerPlugin(ScrollTrigger);
  gsap.matchMedia().add("(prefers-reduced-motion: no-preference)", () => {
    gsap.from("[data-hero]", { opacity: 0, y: 19, duration: .72, stagger: .11, ease: "power2.out", clearProps: "opacity,transform" });
    const revelar = (elementos) => {
      ScrollTrigger.batch(elementos, {
        start: "top 98%", once: true,
        onEnter: (grupo) => gsap.fromTo(grupo, { opacity: .42, y: 16 }, {
          opacity: 1, y: 0, duration: .58, stagger: .085, ease: "power2.out", clearProps: "opacity,transform",
        }),
      });
    };
    const parallax = (fotos) => {
      gsap.utils.toArray(fotos).forEach((imagen) => {
        gsap.fromTo(imagen, { yPercent: -2.15 }, {
          yPercent: 2.15, ease: "none",
          scrollTrigger: { trigger: imagen.parentElement, start: "top bottom", end: "bottom top", scrub: .55 },
        });
      });
    };
    revelar(document.querySelectorAll(".grill-panel[data-reveal]"));
    parallax(".hero [data-parallax], .grill-panel [data-parallax]");

    // Reconstruye las posiciones de scroll al cambiar la altura de la cuadrícula.
    let animacionesCatalogo;
    actualizarAnimacionesCatalogo = () => {
      animacionesCatalogo?.revert();
      animacionesCatalogo = gsap.context(() => {
        const tarjetas = [...menu.querySelectorAll(".product-card:not([hidden])")];
        revelar(tarjetas);
        parallax(tarjetas.map((tarjeta) => tarjeta.querySelector("img")));
      });
      ScrollTrigger.refresh();
    };
    actualizarAnimacionesCatalogo();
    return () => {
      animacionesCatalogo?.revert();
      actualizarAnimacionesCatalogo = () => {};
    };
  });
}

crearCatalogo();
actualizarCampos();
mostrarCarrito();
if (CONFIG.qrPichincha) {
  imagenQR.addEventListener("load", () => {
    qrDisponible = true;
    if (!pago.hidden) mostrarPago();
  });
  $("save-qr").href = CONFIG.qrPichincha;
  imagenQR.src = CONFIG.qrPichincha;
}
iniciarAnimaciones();
