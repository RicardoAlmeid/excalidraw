import type { BinaryFileData } from "@excalidraw/excalidraw/types";

import type { ExcalidrawElement, FileId } from "@excalidraw/element/types";

import type { AppState } from "@excalidraw/excalidraw/types";

import { FIREBASE_STORAGE_PREFIXES } from "../app_constants";

import {
  loadFilesFromFirebase,
  loadFromFirebase,
  saveFilesToFirebase,
  saveToFirebase,
  isSavedToFirebase,
} from "./firebase";
import {
  loadFilesFromPostgres,
  loadFromPostgres,
  saveFilesToPostgres,
  saveToPostgres,
  isSavedToPostgres,
} from "./Postgres";

import type Portal from "../collab/Portal";
import type { SyncableExcalidrawElement } from ".";

import type { Socket } from "socket.io-client";

const STORAGE_KIND = (
  import.meta.env.VITE_APP_REMOTE_STORAGE ?? "firebase"
).toLowerCase() as RemoteStorageKind;

type RemoteStorageKind = "firebase" | "postgres";

type SaveFilesResult = {
  savedFiles: FileId[];
  erroredFiles: FileId[];
};

type LoadFilesResult = {
  loadedFiles: BinaryFileData[];
  erroredFiles: Map<FileId, true>;
};

interface RemoteStorageAdapter {
  kind: RemoteStorageKind;
  isSceneSaved: (
    portal: Portal,
    elements: readonly ExcalidrawElement[],
  ) => boolean;
  saveScene: (
    portal: Portal,
    elements: readonly SyncableExcalidrawElement[],
    appState: AppState,
  ) => Promise<readonly SyncableExcalidrawElement[] | null>;
  loadScene: (
    roomId: string,
    roomKey: string,
    socket: Socket | null,
  ) => Promise<readonly SyncableExcalidrawElement[] | null>;
  saveFiles: ({
    prefix,
    files,
  }: {
    prefix: string;
    files: { id: FileId; buffer: Uint8Array }[];
  }) => Promise<SaveFilesResult>;
  loadFiles: (
    prefix: string,
    decryptionKey: string,
    fileIds: readonly FileId[],
  ) => Promise<LoadFilesResult>;
  getFilesPrefix: (roomId: string) => string;
}

const firebaseAdapter: RemoteStorageAdapter = {
  kind: "firebase",
  isSceneSaved: isSavedToFirebase,
  saveScene: saveToFirebase,
  loadScene: loadFromFirebase,
  saveFiles: saveFilesToFirebase,
  loadFiles: loadFilesFromFirebase,
  getFilesPrefix: (roomId) =>
    `${FIREBASE_STORAGE_PREFIXES.collabFiles}/${roomId}`,
};

const postgresAdapter: RemoteStorageAdapter = {
  kind: "postgres",
  isSceneSaved: isSavedToPostgres,
  saveScene: saveToPostgres,
  loadScene: loadFromPostgres,
  saveFiles: saveFilesToPostgres,
  loadFiles: loadFilesFromPostgres,
  getFilesPrefix: (roomId) => `rooms/${roomId}`,
};

const adapter: RemoteStorageAdapter =
  STORAGE_KIND === "postgres" ? postgresAdapter : firebaseAdapter;

export const remoteStorageKind = adapter.kind;

export const isSceneSavedRemotely: RemoteStorageAdapter["isSceneSaved"] = (
  portal,
  elements,
) => adapter.isSceneSaved(portal, elements);

export const saveSceneToRemote: RemoteStorageAdapter["saveScene"] = (
  portal,
  elements,
  appState,
) => adapter.saveScene(portal, elements, appState);

export const loadSceneFromRemote: RemoteStorageAdapter["loadScene"] = (
  roomId,
  roomKey,
  socket,
) => adapter.loadScene(roomId, roomKey, socket);

export const saveFilesToRemote: RemoteStorageAdapter["saveFiles"] = (options) =>
  adapter.saveFiles(options);

export const loadFilesFromRemote: RemoteStorageAdapter["loadFiles"] = (
  prefix,
  decryptionKey,
  fileIds,
) => adapter.loadFiles(prefix, decryptionKey, fileIds);

export const getRemoteFilesPrefix: RemoteStorageAdapter["getFilesPrefix"] = (
  roomId,
) => adapter.getFilesPrefix(roomId);
