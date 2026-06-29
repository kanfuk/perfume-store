import { NextResponse } from "next/server";

function getHeaderValue(request: Request, name: string) {
  return request.headers.get(name)?.trim() || "";
}

function getRequestOrigin(request: Request) {
  try {
    return new URL(request.url).origin;
  } catch {
    return "";
  }
}

function extractOriginFromHeader(value: string) {
  if (!value) {
    return "";
  }

  try {
    return new URL(value).origin;
  } catch {
    return "";
  }
}

export function validateTrustedOrigin(request: Request) {
  const requestOrigin = getRequestOrigin(request);
  const originHeader = getHeaderValue(request, "origin");
  const refererHeader = getHeaderValue(request, "referer");
  const originToCompare =
    extractOriginFromHeader(originHeader) || extractOriginFromHeader(refererHeader);

  if (!requestOrigin || !originToCompare) {
    return null;
  }

  if (originToCompare !== requestOrigin) {
    return NextResponse.json(
      { error: "Origen de solicitud no permitido." },
      { status: 403 }
    );
  }

  return null;
}

export function validateJsonRequest(request: Request) {
  const contentType = getHeaderValue(request, "content-type").toLowerCase();

  if (!contentType.includes("application/json")) {
    return NextResponse.json(
      { error: "Formato de solicitud no soportado." },
      { status: 415 }
    );
  }

  return null;
}
