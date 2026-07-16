export type UserListType = 'favorites' | 'want' | 'watching' | 'completed' | 'custom';
export type UserListVisibility = 'private' | 'public';

export type UserListRecord = Readonly<{
  id: number;
  userId: number;
  name: string;
  listType: UserListType;
  visibility: UserListVisibility;
  isSystem: boolean;
  sortOrder: number;
  itemCount?: number;
}>;

export type UserListItemAnime = Readonly<{
  listId: number;
  animeId: number;
  note: string | null;
  sortOrder: number;
  createdAt: string;
  title: string;
  cover: string | null;
  viewCount: number | null;
}>;

export interface ListsRepository {
  listForUser(userId: number): Promise<ReadonlyArray<UserListRecord>>;
  getList(userId: number, listId: number): Promise<UserListRecord | null>;
  ensureSystemLists(userId: number): Promise<void>;
  createCustomList(userId: number, name: string): Promise<UserListRecord>;
  deleteCustomList(userId: number, listId: number): Promise<void>;
  listItems(userId: number, listId: number): Promise<ReadonlyArray<UserListItemAnime>>;
  addItem(userId: number, listId: number, animeId: number, note?: string | null): Promise<void>;
  removeItem(userId: number, listId: number, animeId: number): Promise<void>;
  setItemNote(userId: number, listId: number, animeId: number, note: string | null): Promise<void>;
}
