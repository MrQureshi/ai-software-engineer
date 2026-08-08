import { Annotation, MessagesAnnotation } from "@langchain/langgraph";

export const SoftwareEngineerState = Annotation.Root({
  ...MessagesAnnotation.spec,

  userRequest: Annotation<string>,

  plan: Annotation<string[]>({
    value: (_existing, newValue) => newValue,
    default: () => [],
  }),

  repositoryFiles: Annotation<string>({
    value: (_existing, newValue) => newValue,
    default: () => "",
  }),

  codeAnalysis: Annotation<string>({
    value: (_existing, newValue) => newValue,
    default: () => "",
  }),
});

export type SoftwareEngineerStateType = typeof SoftwareEngineerState.State;
