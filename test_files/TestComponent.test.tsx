```tsx
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import TestComponent from './TestComponent';

describe('TestComponent', () => {
  const onClickMock = jest.fn();

  it('renders correctly with name prop', () => {
    render(<TestComponent name="John" onClick={onClickMock} />);
    expect(screen.getByText(/Hello John/i)).toBeInTheDocument();
  });

  it('calls onClick function when button is clicked', async () => {
    userEvent.click(screen.getByRole('button', { name: /click me/i }));
    expect(onClickMock).toHaveBeenCalledTimes(1);
  });

  it('matches snapshot', () => {
    const { asFragment } = render(<TestComponent name="John" onClick={onClickMock} />);
    expect(asFragment()).toMatchSnapshot();
  });

  it('is accessible with proper aria-labels and roles', () => {
    render(<TestComponent name="Jane" onClick={onClickMock} />);
    expect(screen.getByRole('heading', { name: /hello jane/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /click me/i })).toBeInTheDocument();
  });
});
```