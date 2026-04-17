import { invoke } from "@tauri-apps/api/core";
import type { Sticky, Item, ItemUpsert } from "./types";

export const ipc = {
  getOrCreateDefaultSticky: (): Promise<Sticky> =>
    invoke("get_or_create_default_sticky"),

  listStickies: (): Promise<Sticky[]> =>
    invoke("list_stickies"),

  listItems: (stickyId: string): Promise<Item[]> =>
    invoke("list_items", { stickyId }),

  upsertItem: (input: ItemUpsert): Promise<Item> =>
    invoke("upsert_item", { input }),

  toggleItem: (id: string): Promise<Item> =>
    invoke("toggle_item", { id }),

  deleteItem: (id: string): Promise<void> =>
    invoke("delete_item", { id }),
};
