export declare abstract class Component {
  static commands?: Record<
    string,
    {
      handler: (options: Record<string, any>) => Promise<void> | void;
    }
  >;

  id: string;
  context: ComponentContext;
  inputs: Record<string, any>;

  protected constructor(id: string, context: ComponentContext, inputs: Record<string, any>);

  abstract deploy(): Promise<void>;
  abstract remove(): Promise<void>;
  abstract info(): Promise<void>;
  abstract refreshOutputs(): Promise<void>;
  logs?(): Promise<void>;
}

export interface ComponentContext {
  readonly stage: string;
  state: Record<string, any>;
  outputs: Record<string, any>;
  save(): Promise<void>;
  updateOutputs(outputs: Record<string, any>): Promise<void>;
  writeText(message: string, namespace?: string[]): void;
  logVerbose(message: string, namespace?: string[]): void;
  logError(error: string | Error, namespace?: string[]): void;
  startProgress(text: string): void;
  updateProgress(text: string): void;
  successProgress(text: string): void;
}
