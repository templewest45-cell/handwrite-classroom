export { RoomDurableObject } from "./do";

const noopWorker: ExportedHandler = {
  async fetch(): Promise<Response> {
    return new Response("ok");
  },
};

export default noopWorker;

