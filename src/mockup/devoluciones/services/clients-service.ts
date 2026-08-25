import type { Client } from "../types";
import { SEED_CLIENTS } from "../data/seed";
import { delay } from "../lib/utils";

export const clientsService = {
  list: (): Promise<Client[]> => delay(SEED_CLIENTS, 350),

  bySubcanales: (subcanalIds: string[]): Promise<Client[]> =>
    delay(
      SEED_CLIENTS.filter((c) => subcanalIds.includes(c.subcanalId)),
      300,
    ),

  byChannels: (channelIds: string[]): Promise<Client[]> =>
    delay(
      SEED_CLIENTS.filter((c) => channelIds.includes(c.channelId)),
      300,
    ),
};
