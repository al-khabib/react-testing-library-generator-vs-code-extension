import React from 'react'
import { render, fireEvent } from '@testing-library/react';
import TestComponent from './TestComponent';

describe('TestComponent', () => {
  it('renders with default props', () => {
    const { getByRole } = render(<TestComponent />);
    expect(getByRole('button')).toBeInTheDocument();
  });

  it('renders with custom name prop', () => {
    const { getByRole } = render(<TestComponent name="custom-name" />);
    expect(getByRole('button')).toHaveTextContent('Custom Name');
  });

  it('calls onClick handler when button is clicked', () => {
    const onClickMock = jest.fn();
    const { getByRole } = render(<TestComponent onClick={onClickMock} />);
    fireEvent.click(getByRole('button'));
    expect(onClickMock).toHaveBeenCalledTimes(1);
  });
});