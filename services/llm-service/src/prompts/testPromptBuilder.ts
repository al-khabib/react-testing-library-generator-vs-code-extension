import {
  ComponentAnalysis,
  GenerationOptions
} from '../types';

interface PromptBuilderOptions {
  examples?: string[];
  options?: GenerationOptions;
}

const formatProps = (analysis: ComponentAnalysis): string => {
  if (!analysis.props.length) {
    return 'No explicit props detected.';
  }

  return analysis.props
    .map((prop) => `- ${prop.name}${prop.type ? `: ${prop.type}` : ''} (required: ${prop.required})${prop.defaultValue ? ` default=${prop.defaultValue}` : ''}`)
    .join('\n');
};

const formatHooks = (analysis: ComponentAnalysis): string => {
  if (!analysis.hooks.length) {
    return 'No hooks detected.';
  }

  return analysis.hooks
    .map((hook) => `- ${hook.name}${hook.dependencies?.length ? ` (dependencies: ${hook.dependencies.join(', ')})` : ''}`)
    .join('\n');
};

const formatEventHandlers = (analysis: ComponentAnalysis): string => {
  if (!analysis.eventHandlers.length) {
    return 'No explicit event handlers detected.';
  }

  return analysis.eventHandlers
    .map((handler) => `- ${handler.name} handled by ${handler.handler}${handler.element ? ` on <${handler.element}>` : ''}`)
    .join('\n');
};

const formatTestingRecommendations = (analysis: ComponentAnalysis): string => {
  if (!analysis.testingRecommendations.length) {
    return 'Follow standard React Testing Library best practices.';
  }

  return analysis.testingRecommendations.map((rec) => `- ${rec}`).join('\n');
};

export const buildPrompt = (analysis: ComponentAnalysis, builderOptions?: PromptBuilderOptions): string => {
  const header =
    'System: You are an expert React Testing Library test generator. Respond with idiomatic tests that follow best practices.';

  const metadata = (analysis.metadata ?? {}) as Record<string, unknown>;
  const displayName =
    typeof metadata.displayName === 'string' && metadata.displayName.trim().length
      ? metadata.displayName.trim()
      : analysis.name;
  const userInstructions =
    typeof metadata.instructions === 'string' && metadata.instructions.trim().length
      ? metadata.instructions.trim()
      : null;
  const sourceDescription =
    typeof metadata.source === 'string' && metadata.source.trim().length
      ? metadata.source === 'selection'
        ? 'Only a selection of the component was provided. Avoid assumptions about omitted code.'
        : 'The full component file was provided.'
      : null;

  const summaryLines = [
    `- Name: ${analysis.name}`,
    ...(displayName !== analysis.name ? [`- Preferred Display Name: ${displayName}`] : []),
    `- Type: ${analysis.type}`,
    `- Complexity Score: ${analysis.complexity}`,
    `- Data Test IDs: ${analysis.dataTestIds.length ? analysis.dataTestIds.join(', ') : 'none'}`
  ];
  const componentSummary = `Component Overview:\n${summaryLines.join('\n')}`;

  const propsSection = `Props:
${formatProps(analysis)}
`;

  const stateSection = `State:
${analysis.state.length ? analysis.state.map((item) => `- ${item.name}${item.initialValue ? ` (initial: ${item.initialValue})` : ''}`).join('\n') : 'No local state hooks detected.'}
`;

  const hooksSection = `Hooks:
${formatHooks(analysis)}
`;

  const handlersSection = `Event Handlers:
${formatEventHandlers(analysis)}
`;

  const importsSection = `Imported Dependencies:
${analysis.imports.length ? analysis.imports.map((imp) => `- ${imp.source} (${[imp.defaultImport, ...imp.imported, imp.namespace].filter(Boolean).join(', ') || 'namespace import'})`).join('\n') : 'No external dependencies detected.'}
`;

  const recommendationsSection = `Testing Recommendations:
${formatTestingRecommendations(analysis)}
`;

  const contextualNotes =
    sourceDescription || userInstructions
      ? [
          'Contextual Notes:',
          sourceDescription ? `- ${sourceDescription}` : null,
          userInstructions ? `- User emphasis: ${userInstructions}` : null
        ]
          .filter(Boolean)
          .join('\n')
      : '';

  const instructions = `Instructions:
1. Write React Testing Library tests using TypeScript.
2. Import only what is required for the tests.
3. Cover critical user flows, props combinations, and event handlers.
4. Use descriptive test names and prefer screen queries over destructuring.
5. If hooks or async behavior exist, ensure proper usage of act/waitFor.
6. Provide the final answer as a single test file content. Do not include explanations or additional prose.
`;

  const examplesSection = builderOptions?.examples?.length
    ? `Few-shot Examples:
${builderOptions.examples.join('\n---\n')}
`
    : '';

  const prompt = [
    header,
    componentSummary,
    propsSection,
    stateSection,
    hooksSection,
    handlersSection,
    importsSection,
    recommendationsSection,
    contextualNotes,
    examplesSection,
    instructions,
    `Begin the test file now.`
  ]
    .filter(Boolean)
    .join('\n\n');

  return prompt;
};
