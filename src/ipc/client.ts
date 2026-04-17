import { invoke } from "@tauri-apps/api/core";
import type { Sticky, Item, ItemUpsert, StickyPatch } from "./types";

export const ipc = {
  getOrCreateDefaultSticky: (): Promise<Sticky> =>
    invoke("get_or_create_default_sticky"),

  listStickies: (): Promise<Sticky[]> =>
    invoke("list_stickies"),

  listAllStickies: (): Promise<Sticky[]> =>
    invoke("list_all_stickies"),

  getSticky: (id: string): Promise<Sticky> =>
    invoke("get_sticky", { id }),

  createSticky: (): Promise<Sticky> =>
    invoke("create_sticky"),

  updateSticky: (id: string, patch: StickyPatch): Promise<Sticky> =>
    invoke("update_sticky", { id, patch }),

  deleteSticky: (id: string): Promise<void> =>
    invoke("delete_sticky", { id }),

  listItems: (stickyId: string): Promise<Item[]> =>
    invoke("list_items", { stickyId }),

  upsertItem: (input: ItemUpsert): Promise<Item> =>
    invoke("upsert_item", { input }),

  toggleItem: (id: string): Promise<Item> =>
    invoke("toggle_item", { id }),

  deleteItem: (id: string): Promise<void> =>
    invoke("delete_item", { id }),

  openStickyWindow: (stickyId: string): Promise<void> =>
    invoke("open_sticky_window", { stickyId }),

  hideSticky: (stickyId: string): Promise<void> =>
    invoke("hide_sticky", { stickyId }),

  showSticky: (stickyId: string): Promise<void> =>
    invoke("show_sticky", { stickyId }),

  togglePin: (stickyId: string): Promise<boolean> =>
    invoke("toggle_pin", { stickyId }),

  newStickyWindow: (): Promise<string> =>
    invoke("new_sticky_window"),
};
