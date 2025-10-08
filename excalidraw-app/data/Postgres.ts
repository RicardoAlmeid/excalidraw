import { reconcileElements } from "@excalidraw/excalidraw";
import { MIME_TYPES } from "@excalidraw/common";
import { decompressData } from "@excalidraw/excalidraw/data/encode";
import {
  encryptData,
  decryptData,
} from "@excalidraw/excalidraw/data/encryption";
import { restoreElements } from "@excalidraw/excalidraw/data/restore";
import { getSceneVersion } from "@excalidraw/element";

import type { RemoteExcalidrawElement } from "@excalidraw/excalidraw/data/reconcile";
import type {
  ExcalidrawElement,
  FileId,
  OrderedExcalidrawElement,
} from "@excalidraw/element/types";
import type {
  AppState,
  BinaryFileData,
  BinaryFileMetadata,
  DataURL,
} from "@excalidraw/excalidraw/types";

import { getSyncableElements } from ".";

import type { SyncableExcalidrawElement } from ".";

import type Portal from "../collab/Portal";
import type { Socket } from "socket.io-client";

const DEFAULT_POD_BASE_URL = "http://localhost:4001";

const POSTGRES_API_BASE_URL =
  import.meta.env.VITE_APP_POSTGRES_API_BASE_URL ?? DEFAULT_POD_BASE_URL;

const SCENES_ENDPOINT = `${POSTGRES_API_BASE_URL}/scenes`;
const FILES_ENDPOINT = `${POSTGRES_API_BASE_URL}/files`;

type PostgresStoredScene = {
  sceneVersion: number;
  ciphertext: string;
  iv: string;
};

type PostgresStoredFile = {
  id: FileId;
  payload: string;
  metadata?: BinaryFileMetadata | null;
};

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder("utf-8");

const toBase64 = (buffer: ArrayBuffer | Uint8Array) => {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  let binary = "";
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    const chunk = bytes.subarray(index, index + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
};

const fromBase64 = (value: string) => {
  const binary = atob(value);
  const length = binary.length;
  const bytes = new Uint8Array(length);
  for (let index = 0; index < length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
};

const encryptElements = async (
  key: string,
  elements: readonly ExcalidrawElement[],
): Promise<{ ciphertext: ArrayBuffer; iv: Uint8Array }> => {
  const json = JSON.stringify(elements);
  const encoded = textEncoder.encode(json);
  const { encryptedBuffer, iv } = await encryptData(key, encoded);

  return { ciphertext: encryptedBuffer, iv };
};

const decryptElements = async (
  data: PostgresStoredScene,
  roomKey: string,
): Promise<readonly ExcalidrawElement[]> => {
  const ciphertext = fromBase64(data.ciphertext);
  const iv = fromBase64(data.iv);

  const decrypted = await decryptData(iv, ciphertext, roomKey);
  const decodedData = textDecoder.decode(new Uint8Array(decrypted));
  return JSON.parse(decodedData);
};

class PostgresSceneVersionCache {
  private static cache = new WeakMap<Socket, number>();
  static get = (socket: Socket) => {
    return PostgresSceneVersionCache.cache.get(socket);
  };
  static set = (
    socket: Socket,
    elements: readonly SyncableExcalidrawElement[],
  ) => {
    PostgresSceneVersionCache.cache.set(socket, getSceneVersion(elements));
  };
}

const scenesUrl = (roomId: string) => `${SCENES_ENDPOINT}/${roomId}`;

const request = async <T>(input: RequestInfo | URL, init?: RequestInit) => {
  const response = await fetch(input, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    const message = await response.text();
    throw new Error(
      `Postgres request failed with ${response.status}: ${message}`,
    );
  }

  if (response.status === 204) {
    return null as T;
  }

  return (await response.json()) as T;
};

const createScenePayload = async (
  elements: readonly SyncableExcalidrawElement[],
  roomKey: string,
) => {
  const sceneVersion = getSceneVersion(elements);
  const { ciphertext, iv } = await encryptElements(roomKey, elements);

  return {
    sceneVersion,
    ciphertext: toBase64(ciphertext),
    iv: toBase64(iv),
  } as PostgresStoredScene;
};

export const isSavedToPostgres = (
  portal: Portal,
  elements: readonly ExcalidrawElement[],
): boolean => {
  if (portal.socket && portal.roomId && portal.roomKey) {
    const sceneVersion = getSceneVersion(elements);

    return PostgresSceneVersionCache.get(portal.socket) === sceneVersion;
  }
  return true;
};

export const saveFilesToPostgres = async ({
  prefix,
  files,
}: {
  prefix: string;
  files: { id: FileId; buffer: Uint8Array }[];
}) => {
  if (!files.length) {
    return { savedFiles: [], erroredFiles: [] as FileId[] };
  }

  const payload = {
    prefix,
    files: files.map(({ id, buffer }) => ({
      id,
      payload: toBase64(buffer),
    })),
  };

  try {
    const response = await request<{ saved?: FileId[]; errored?: FileId[] }>(
      `${FILES_ENDPOINT}/bulk`,
      {
        method: "POST",
        body: JSON.stringify(payload),
      },
    );

    const savedFiles = response?.saved ?? files.map((file) => file.id);
    const erroredFiles = response?.errored ?? [];

    return { savedFiles, erroredFiles };
  } catch (error: any) {
    console.error(error);
    return {
      savedFiles: [],
      erroredFiles: files.map((file) => file.id),
    };
  }
};

const upsertScene = async (roomId: string, payload: PostgresStoredScene) => {
  await request<void>(scenesUrl(roomId), {
    method: "PUT",
    body: JSON.stringify(payload),
  });
};

export const saveToPostgres = async (
  portal: Portal,
  elements: readonly SyncableExcalidrawElement[],
  appState: AppState,
) => {
  const { roomId, roomKey, socket } = portal;

  if (!roomId || !roomKey || !socket || isSavedToPostgres(portal, elements)) {
    return null;
  }

  const existingScene = await request<PostgresStoredScene | null>(
    scenesUrl(roomId),
  );

  if (!existingScene) {
    const payload = await createScenePayload(elements, roomKey);
    await upsertScene(roomId, payload);

    PostgresSceneVersionCache.set(socket, elements);
    return elements;
  }

  const prevStoredElements = getSyncableElements(
    restoreElements(await decryptElements(existingScene, roomKey), null),
  );

  const reconciledElements = getSyncableElements(
    reconcileElements(
      elements,
      prevStoredElements as OrderedExcalidrawElement[] as RemoteExcalidrawElement[],
      appState,
    ),
  );

  const payload = await createScenePayload(reconciledElements, roomKey);
  await upsertScene(roomId, payload);

  PostgresSceneVersionCache.set(socket, reconciledElements);

  return reconciledElements;
};

export const loadFromPostgres = async (
  roomId: string,
  roomKey: string,
  socket: Socket | null,
): Promise<readonly SyncableExcalidrawElement[] | null> => {
  const storedScene = await request<PostgresStoredScene | null>(
    scenesUrl(roomId),
  );

  if (!storedScene) {
    return null;
  }

  const elements = getSyncableElements(
    restoreElements(await decryptElements(storedScene, roomKey), null, {
      deleteInvisibleElements: true,
    }),
  );

  if (socket) {
    PostgresSceneVersionCache.set(socket, elements);
  }

  return elements;
};

export const loadFilesFromPostgres = async (
  prefix: string,
  decryptionKey: string,
  fileIds: readonly FileId[],
) => {
  if (!fileIds.length) {
    return { loadedFiles: [] as BinaryFileData[], erroredFiles: new Map() };
  }

  const payload = {
    prefix,
    fileIds: [...new Set(fileIds)],
  };

  try {
    const response = await request<{ files: PostgresStoredFile[] } | null>(
      `${FILES_ENDPOINT}/bulk-read`,
      {
        method: "POST",
        body: JSON.stringify(payload),
      },
    );

    if (!response?.files?.length) {
      return {
        loadedFiles: [],
        erroredFiles: new Map(
          fileIds.map((id) => [id, true] as [FileId, true]),
        ),
      };
    }

    const loadedFiles: BinaryFileData[] = [];
    const erroredFiles = new Map<FileId, true>();

    await Promise.all(
      response.files.map(async (file) => {
        try {
          const rawData = fromBase64(file.payload);
          const { data, metadata } = await decompressData<BinaryFileMetadata>(
            rawData,
            { decryptionKey },
          );

          const dataURL = textDecoder.decode(data) as DataURL;

          loadedFiles.push({
            mimeType: metadata?.mimeType || MIME_TYPES.binary,
            id: file.id,
            dataURL,
            created: metadata?.created || Date.now(),
            lastRetrieved: metadata?.created || Date.now(),
          });
        } catch (error: any) {
          console.error(error);
          erroredFiles.set(file.id, true);
        }
      }),
    );

    fileIds.forEach((id) => {
      if (!loadedFiles.find((file) => file.id === id)) {
        erroredFiles.set(id, true);
      }
    });

    return { loadedFiles, erroredFiles };
  } catch (error: any) {
    console.error(error);
    return {
      loadedFiles: [],
      erroredFiles: new Map(fileIds.map((id) => [id, true] as [FileId, true])),
    };
  }
};
