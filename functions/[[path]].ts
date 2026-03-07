import api from "../src/api";
import type { Env } from "../src/shared";

export const onRequest: PagesFunction<Env> = async (context) => {
  return api.fetch(context.request, context.env);
};

