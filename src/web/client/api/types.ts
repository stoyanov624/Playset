// What the web app (Visitor screens and the admin page) asks of Playset's server; the real client and test fakes both implement it.
import type {
  AdminStatusResponse,
  ArtistSetlistsResponse,
  ArtistsResponse,
  CreatePlaylistResponse,
  PreviewProgress,
  PreviewResult,
  SetlistLinksResponse,
  SetlistResponse,
} from "../../shared/index.js";

export interface PreviewOptions {
  onProgress: (progress: PreviewProgress) => void;
  signal?: AbortSignal | undefined;
}

export interface PlaysetApi {
  searchArtists: (name: string, signal?: AbortSignal) => Promise<ArtistsResponse>;
  getArtistSetlists: (mbid: string, page: number, signal?: AbortSignal) => Promise<ArtistSetlistsResponse>;
  readSetlistLink: (url: string, signal?: AbortSignal) => Promise<SetlistLinksResponse>;
  getSetlist: (id: string, signal?: AbortSignal) => Promise<SetlistResponse>;
  streamPreview: (id: string, options: PreviewOptions) => Promise<PreviewResult>;
  /** Never cancelled: once sent, the server finishes the playlist even if the Visitor leaves. */
  createPlaylist: (id: string, versionId: string) => Promise<CreatePlaylistResponse>;
  /** Fails with `NOT_ADMIN` when nobody, or not the Host Account, is logged in. */
  getAdminStatus: (signal?: AbortSignal) => Promise<AdminStatusResponse>;
  /** Never cancelled: once sent, the server clears the admin's login either way. */
  logOut: () => Promise<void>;
}
