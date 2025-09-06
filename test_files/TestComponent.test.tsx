 ```tsx
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import TestComponent from './path_to_component'; // Adjust the import path accordingly

describe('TestComponent', () => {
  const props = {
    name: 'World',
    onClick: jest.fn()
  };

  it('renders correctly with default props', () => {
    render(<TestComponent {...props} />);
    expect(screen.getByText(/Hello World/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /click me/i })).toBeInTheDocument();
  });

  it('calls onClick when button is clicked', async () => {
    render(<TestComponent {...props} />);
    userEvent.click(screen.getByRole('button', { name: /click me/i }));
    expect(props.onClick).toHaveBeenCalledTimes(1);
  });

  it('matches snapshot', () => {
    const { asFragment } = render(<TestComponent {...props} />);
    expect(asFragment()).toMatchSnapshot();
  });

  it('is accessible using axe-core for accessibility violations', async () => {
    const { container } = render(<TestComponent {...props} />);
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});
```