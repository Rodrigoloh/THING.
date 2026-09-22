// A Thing is a shared connection between exactly two users.
// Participant and persistence types will be defined with the Supabase schema.
export type Thing = {
  id: string;
  charm: string;
  accent?: string;
  createdAt: string;
};
