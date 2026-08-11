import { rootReducer } from "./rootReducer";

export const store = createStore(rootReducer);

export type RootState = ReturnType<typeof store.getState>;
