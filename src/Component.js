class Component {
  /**
   * @param {string} id
   * @param {Context} context
   * @param inputs
   */
  constructor(id, context, inputs) {
    this.id = id || this.constructor.name;
    this.inputs = inputs;

    if (this.id === 'Context') {
      throw Error('You cannot use "Context" as a component name. It is reserved.');
    }

    this.context = context;

    // Set state
    this.state = {};

    // make sure author defined the mandatory functions
    if (typeof this.deploy !== 'function') {
      throw Error(`deploy function is missing for component "${this.id}"`);
    }
    if (typeof this.outputs === 'function') {
      throw Error(`Cannot declare a "outputs" function in component "${this.id}"`);
    }
  }

  // populating state is an async operation in most contexts
  // and we can't run async operations in the constructor
  // so we can't auto populate state on instance construction
  async init() {
    this.state = await this.context.stateStorage.readComponentState(this.id);
    this.outputs = await this.context.stateStorage.readComponentOutputs(this.id);
  }

  async save() {
    await this.context.stateStorage.writeComponentState(this.id, this.state);
  }

  async updateOutputs(outputs) {
    this.outputs = outputs;
    await this.context.stateStorage.writeComponentOutputs(
      this.id,
      this.outputs
    );
  }
}

module.exports = Component;
