import { instance } from "./instance-config";
export const dashboardComposeEvent = {
  bill: `${instance.id}:compose-bill`,
  post: `${instance.id}:compose-post`,
} as const;
