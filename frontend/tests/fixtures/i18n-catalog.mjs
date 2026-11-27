import { createServer } from "node:http";

// Catalog data for rendering real product routes without the production API.
const products = Array.from({ length: 12 }, (_, i) => ({
  code: `TEST-${String(i + 1).padStart(2, "0")}`,
  name: `Test film ${i + 1}`,
  type: "tint",
  series: "Test Series",
  description: "",
}));

createServer((req, res) => {
  res.setHeader("Content-Type", "application/json");
  if (req.url === "/api/catalog") res.end(JSON.stringify(products));
  else if (req.url === "/api/portal/me") res.end('{"user":null}');
  else {
    res.statusCode = 404;
    res.end('{"error":"Not found"}');
  }
}).listen(5107, "127.0.0.1");
