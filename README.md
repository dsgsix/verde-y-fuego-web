# Verde & Fuego

Sitio estático de cocina manabita. Abre `index.html` o inicia un servidor local con `npx --yes serve .`. El catálogo, el carrito y el comprobante funcionan en el navegador.

## Configurar el cobro

1. Exporta el QR oficial de cobro sin monto fijo desde Banca Móvil Pichincha o Deuna y guárdalo como `assets/qr-pichincha.png`.
2. Asigna `"./assets/qr-pichincha.png"` a `CONFIG.qrPichincha` en `app.js`. El número de WhatsApp del negocio se configura en `CONFIG.whatsapp`, en formato internacional sin `+` ni espacios.
3. Revisa los precios en `PRODUCTOS`. Ajusta `CONFIG.entregaCentavos` si el negocio tiene una tarifa fija. Con `null`, el cliente consulta el total de la entrega por WhatsApp antes de transferir.

El sitio genera un comprobante de **pedido** en PNG y usa la misma referencia en WhatsApp. El cliente adjunta el comprobante emitido por su banco en el chat y el negocio verifica la transferencia.
