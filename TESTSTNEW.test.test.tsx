
import { render, screen, fireEvent } from '@testing-library/react'
import TestComponent from '../TestComponent'

describe('TestComponent', () => {
  const mockClickHandler = jest.fn()

  afterEach(() => {
    jest.clearAllMocks()
  })

  test('renders the correct name in an h1 tag', () => {
    render(<TestComponent name="John Doe" onClick={mockClickHandler} />)
    expect(screen.getByRole('heading')).toHaveTextContent(/Hello John Doe/i)
  })

  test('calls click handler when button is clicked', () => {
    render(<TestComponent name="Jane Smith" onClick={mockClickHandler} />)
    
    const button = screen.getByRole('button', { name: 'Click me' })
    fireEvent.click(button)
    
    expect(mockClickHandler).toHaveBeenCalled()
  })

  test('displays a heading and clickable button in the DOM structure', () => {
    render(<TestComponent name="Alice" onClick={mockClickHandler} />)
    
    // Check component has required elements
    const heading = screen.getByRole('heading')
    const button = screen.getByRole('button')

    // Verify correct parent container exists
    expect(button.parentElement).toBeInTheDocument()
    expect(heading.parentElement).toBe(button.parentElement)

    // Test snapshot functionality (requires jest snapshots)
    expect(screen.queryAllByRole('button')).toHaveLength(1)
    expect(screen.queryAllByText(/Hello/i)).toHaveLength(1)
  })

  test('matches the default snapshot', () => {
    const { asFragment } = render(<TestComponent name="Default" onClick={mockClickHandler} />)
    expect(asFragment()).toMatchSnapshot()
  })
})
