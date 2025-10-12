import { render, fireEvent } from '@testing-library/react';
import TestComponent from './TestComponent';

describe('TestComponent', () => {
  it('renders with default props', () => {
    const { getByRole } = render(<TestComponent />);
    expect(getByRole('button')).toBeInTheDocument();
  });

  it('calls onClick when button is clicked', () => {
    const onClickMock = jest.fn();
    const { getByRole } = render(<TestComponent onClick={onClickMock} />);
    fireEvent.click(getByRole('button'));
    expect(onClickMock).toHaveBeenCalledTimes(1);
  });

  it('renders with custom name prop', () => {
    const { getByText } = render(<TestComponent name="Custom Name" />);
    expect(getByText('Custom Name')).toBeInTheDocument();
  });

  it('renders with custom onClick prop', () => {
    const onClickMock = jest.fn();
    const { getByRole } = render(<TestComponent onClick={onClickMock} />);
    fireEvent.click(getByRole('button'));
    expect(onClickMock).toHaveBeenCalledTimes(1);
  });
});