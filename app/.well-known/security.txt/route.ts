const securityTxt = [
  "Contact: mailto:kanfuk@gmail.com",
  "Preferred-Languages: es, en",
  "Canonical: https://pauli-store-clientes.vercel.app/.well-known/security.txt",
  "Expires: 2027-06-16T00:00:00.000Z"
].join("\n");

export function GET() {
  return new Response(securityTxt, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=3600"
    }
  });
}
