import api from "../src/api";
import type { Env } from "../src/shared";

export const onRequest: PagesFunction<Env> = async (context) => {
  const pathname = new URL(context.request.url).pathname;
  if (pathname.startsWith("/guide-assets/")) {
    return context.next();
  }
  return api.fetch(context.request, context.env);
};
