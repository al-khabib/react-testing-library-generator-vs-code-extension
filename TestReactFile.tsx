import React from 'react'

type TestReactFileProps = {
  title: string
  subtitle?: string
}

const TestReactFile: React.FC<TestReactFileProps> = ({ title, subtitle }) => {
  return (
    <div>
      <h1>{title}</h1>
      {subtitle && <h2>{subtitle}</h2>}
      <button onClick={() => console.log('Test me')}></button>
    </div>
  )
}

export default TestReactFile

// Pass a reference to the file and LLM locates the file and generate the tests
// highlight a chunk of code in the file and generate tests for that chunk
// make it more flexible and universal
// github copilot like running and ui
