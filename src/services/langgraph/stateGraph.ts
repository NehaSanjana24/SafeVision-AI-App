/**
 * Client-Side LangGraph-compatible StateGraph Engine
 * Provides state transitions, conditional edges, step limits, timeout guards,
 * and streaming event dispatchers.
 */

export type NodeHandler<TState> = (state: TState) => Promise<Partial<TState>>;
export type ConditionalRouter<TState> = (state: TState) => string | Promise<string>;

export interface StateGraphConfig {
  maxSteps?: number;
  timeoutMs?: number;
}

export type StateGraphEventType =
  | 'start'
  | 'node_start'
  | 'node_end'
  | 'token'
  | 'tool_trace'
  | 'workflow'
  | 'approval_required'
  | 'error'
  | 'finish';

export interface StateGraphEvent<TState = any> {
  type: StateGraphEventType;
  node?: string;
  state?: TState;
  token?: string;
  payload?: any;
  timestamp: string;
}

export class StateGraph<TState extends Record<string, any>> {
  private nodes: Map<string, NodeHandler<TState>> = new Map();
  private edges: Map<string, string> = new Map();
  private conditionalEdges: Map<string, ConditionalRouter<TState>> = new Map();
  private entryPoint: string = 'start';
  private maxSteps: number;
  private timeoutMs: number;
  private listeners: Set<(event: StateGraphEvent<TState>) => void> = new Set();

  constructor(config: StateGraphConfig = {}) {
    this.maxSteps = config.maxSteps || 12;
    this.timeoutMs = config.timeoutMs || 45000;
  }

  addNode(name: string, handler: NodeHandler<TState>): this {
    this.nodes.set(name, handler);
    return this;
  }

  addEdge(fromNode: string, toNode: string): this {
    this.edges.set(fromNode, toNode);
    return this;
  }

  addConditionalEdges(fromNode: string, router: ConditionalRouter<TState>): this {
    this.conditionalEdges.set(fromNode, router);
    return this;
  }

  setEntryPoint(name: string): this {
    this.entryPoint = name;
    return this;
  }

  subscribe(listener: (event: StateGraphEvent<TState>) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private dispatch(event: StateGraphEvent<TState>) {
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch (err) {
        console.error('StateGraph listener error:', err);
      }
    }
  }

  public emitToken(token: string) {
    this.dispatch({
      type: 'token',
      token,
      payload: token,
      timestamp: new Date().toISOString(),
    });
  }

  public emitToolTrace(payload: any) {
    this.dispatch({
      type: 'tool_trace',
      payload,
      timestamp: new Date().toISOString(),
    });
  }

  public emitWorkflow(payload: any) {
    this.dispatch({
      type: 'workflow',
      payload,
      timestamp: new Date().toISOString(),
    });
  }

  async invoke(
    initialState: TState,
    signal?: AbortSignal
  ): Promise<{ state: TState; stepsExecuted: number }> {
    let currentState: TState = { ...initialState };
    let currentNode: string | undefined = this.entryPoint;
    let stepCount = 0;

    const timeoutPromise = new Promise<never>((_, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`LangGraph execution exceeded timeout limit of ${this.timeoutMs / 1000}s`));
      }, this.timeoutMs);
      signal?.addEventListener('abort', () => {
        clearTimeout(timer);
        reject(new Error('StateGraph execution aborted by user.'));
      });
    });

    const executionPromise = (async () => {
      this.dispatch({
        type: 'start',
        state: currentState,
        timestamp: new Date().toISOString(),
      });

      while (currentNode && currentNode !== 'END') {
        if (signal?.aborted) {
          throw new Error('StateGraph execution aborted by user.');
        }

        if (stepCount >= this.maxSteps) {
          console.warn(`StateGraph reached maximum execution steps (${this.maxSteps}). Halting.`);
          break;
        }

        const handler = this.nodes.get(currentNode);
        if (!handler) {
          throw new Error(`Node '${currentNode}' not found in StateGraph.`);
        }

        stepCount++;
        this.dispatch({
          type: 'node_start',
          node: currentNode,
          state: currentState,
          timestamp: new Date().toISOString(),
        });

        const partialUpdate = await handler(currentState);
        currentState = { ...currentState, ...partialUpdate };

        this.dispatch({
          type: 'node_end',
          node: currentNode,
          state: currentState,
          timestamp: new Date().toISOString(),
        });

        // Determine next node
        const condRouter: ConditionalRouter<TState> | undefined = this.conditionalEdges.get(currentNode);
        if (condRouter) {
          currentNode = await condRouter(currentState);
        } else if (this.edges.has(currentNode)) {
          currentNode = this.edges.get(currentNode);
        } else {
          // Default terminal
          currentNode = 'END';
        }
      }

      this.dispatch({
        type: 'finish',
        state: currentState,
        timestamp: new Date().toISOString(),
      });

      return { state: currentState, stepsExecuted: stepCount };
    })();

    return Promise.race([executionPromise, timeoutPromise]);
  }
}
