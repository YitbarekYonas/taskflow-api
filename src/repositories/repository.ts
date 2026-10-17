export interface Repository<T extends { id: number }> {
  findAll(): Promise<T[]>;
  findById(id: number): Promise<T | undefined>;
  insert(data: Omit<T, "id">): Promise<T>;
  update(id: number, changes: Partial<Omit<T, "id">>): Promise<T | undefined>;
  remove(id: number): Promise<T | undefined>;
}