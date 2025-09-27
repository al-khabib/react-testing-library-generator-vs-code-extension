import React from "react";

interface Props {
  name: string;
  onClick: () => void;
}

export default function TestComponent({ name, onClick }: Props) {
  return (
    <div>
      <h1>Hello {name}</h1>
      <button onClick={onClick}>Click me</button>
    </div>
  );
}
