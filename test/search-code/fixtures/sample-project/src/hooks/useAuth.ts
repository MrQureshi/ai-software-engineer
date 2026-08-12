import { store } from "../store";

export function useAuth() {
  return store.getState().auth;
}
