function getTestInstanceRecord(
  value: unknown,
  label: string
): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`Expected ${label} to be an object test instance`);
  }
  return value as Record<string, unknown>;
}

export function getTestInstanceProps(value: unknown): Record<string, unknown> {
  const instance = getTestInstanceRecord(value, "test instance");
  const props = instance.props;
  if (typeof props !== "object" || props === null || Array.isArray(props)) {
    throw new Error("Expected test instance props to be an object");
  }
  return props as Record<string, unknown>;
}

export function getTestInstances(value: unknown): readonly unknown[] {
  if (!Array.isArray(value)) {
    throw new Error("Expected test instance collection to be an array");
  }
  return value;
}

export function getTestInstanceParent(value: unknown): unknown {
  const instance = getTestInstanceRecord(value, "test instance");
  if (!("parent" in instance)) {
    throw new Error("Expected test instance to expose a parent property");
  }
  return instance.parent;
}

export function getTestInstanceChildren(value: unknown): readonly unknown[] {
  const instance = getTestInstanceRecord(value, "test instance");
  const children = instance.children;
  if (!Array.isArray(children)) {
    throw new Error("Expected test instance children to be an array");
  }
  return children;
}
