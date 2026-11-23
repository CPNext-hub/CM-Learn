"use client";

// Shared state for BE02 interactions, used by the sheet detail page, the viewer and the sheet cards.
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { authClient } from "@/lib/auth-client";
import {
  addComment,
  countComments,
  deleteComment,
  getComments,
  getFavoriteIds,
  replyToComment,
  setFavorite,
} from "@/services/interactionService";
import type { SheetComment } from "@/types/interaction";

const message = (err: unknown) => (err instanceof Error ? err.message : "ทำรายการไม่สำเร็จ กรุณาลองอีกครั้ง");

/** Who is signed in (null = guest). `ready` is false while the session is still loading. */
export function useViewer() {
  const { data, isPending } = authClient.useSession();
  return { userId: data?.user.id ?? null, ready: !isPending };
}

/**
 * Comments of one sheet. Every action reloads the list from the server, so names, avatars,
 * order and "deleted" placeholders always match what other users see.
 * Actions resolve to "" on success or a Thai error message.
 */
export function useComments(sheetId: string) {
  const [comments, setComments] = useState<SheetComment[] | null>(null);
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    let active = true;
    getComments(sheetId)
      .then((items) => {
        if (!active) return;
        setComments(items);
        setLoadError("");
      })
      .catch((err: unknown) => active && setLoadError(message(err)));
    return () => {
      active = false;
    };
  }, [sheetId]);

  async function run(action: () => Promise<void>) {
    try {
      await action();
      setComments(await getComments(sheetId));
      return "";
    } catch (err) {
      return message(err);
    }
  }

  return {
    comments,
    loadError,
    count: comments ? countComments(comments) : null,
    add: (body: string) => run(() => addComment(sheetId, body)),
    reply: (commentId: string, body: string) => run(() => replyToComment(commentId, body)),
    remove: (commentId: string) => run(() => deleteComment(commentId)),
  };
}

const NONE = new Set<string>();

/** Saved sheets of the signed-in user. Guests who press "save" are sent to the login page. */
export function useFavorites() {
  const router = useRouter();
  const { userId } = useViewer();
  const [saved, setSaved] = useState<Set<string>>(NONE);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!userId) return;
    let active = true;
    getFavoriteIds()
      .then((ids) => active && setSaved(ids))
      .catch(() => {}); // the buttons still work; they just start as "not saved"
    return () => {
      active = false;
    };
  }, [userId]);

  const current = userId ? saved : NONE; // never show the previous user's saves after logout

  async function toggle(sheetId: string) {
    if (!userId) {
      router.push("/login");
      return;
    }
    if (busyId) return;
    const next = !current.has(sheetId);
    const update = (on: boolean) =>
      setSaved((prev) => {
        const copy = new Set(prev);
        if (on) copy.add(sheetId);
        else copy.delete(sheetId);
        return copy;
      });
    setBusyId(sheetId);
    setError("");
    update(next); // optimistic
    try {
      await setFavorite(sheetId, next);
    } catch (err) {
      update(!next);
      setError(message(err));
    } finally {
      setBusyId(null);
    }
  }

  return { isSaved: (sheetId: string) => current.has(sheetId), toggle, busyId, error };
}
