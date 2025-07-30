// src/components/SmartTodoList.tsx

import React, { useReducer, useEffect } from 'react'

type TodoItem = {
  id: number
  text: string
  completed: boolean
}

interface SmartTodoListProps {
  initialTodos?: TodoItem[]
  onChange?: (todos: TodoItem[]) => void
  fetchTodosApi?: () => Promise<TodoItem[]>
  title?: string
}

type Action =
  | { type: 'add'; text: string }
  | { type: 'remove'; id: number }
  | { type: 'toggle'; id: number }
  | { type: 'set'; todos: TodoItem[] }

function todoReducer(state: TodoItem[], action: Action): TodoItem[] {
  switch (action.type) {
    case 'add':
      return [...state, { id: Date.now(), text: action.text, completed: false }]
    case 'remove':
      return state.filter((todo) => todo.id !== action.id)
    case 'toggle':
      return state.map((todo) =>
        todo.id === action.id ? { ...todo, completed: !todo.completed } : todo
      )
    case 'set':
      return action.todos
    default:
      return state
  }
}

const SmartTodoList: React.FC<SmartTodoListProps> = ({
  initialTodos = [],
  onChange,
  fetchTodosApi,
  title = 'My Todo List'
}) => {
  const [todos, dispatch] = useReducer(todoReducer, initialTodos)
  const [input, setInput] = React.useState('')
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  // Fetch todos from API if provided
  useEffect(() => {
    if (fetchTodosApi) {
      setLoading(true)
      fetchTodosApi()
        .then((fetched) => {
          dispatch({ type: 'set', todos: fetched })
          setError(null)
        })
        .catch((e) => setError('Failed to fetch todos'))
        .finally(() => setLoading(false))
    }
    // eslint-disable-next-line
  }, [])

  useEffect(() => {
    onChange?.(todos)
  }, [todos, onChange])

  const addTodo = () => {
    if (input.trim()) {
      dispatch({ type: 'add', text: input })
      setInput('')
    }
  }

  return (
    <div>
      <h1>{title}</h1>
      {loading && <div aria-label='loading'>Loading...</div>}
      {error && <div role='alert'>{error}</div>}
      <ul>
        {todos.map((todo) => (
          <li key={todo.id}>
            <label
              style={{
                textDecoration: todo.completed ? 'line-through' : undefined
              }}
            >
              <input
                aria-label={`toggle-${todo.text}`}
                type='checkbox'
                checked={todo.completed}
                onChange={() => dispatch({ type: 'toggle', id: todo.id })}
              />
              {todo.text}
            </label>
            <button
              aria-label={`remove-${todo.text}`}
              onClick={() => dispatch({ type: 'remove', id: todo.id })}
            >
              Remove
            </button>
          </li>
        ))}
      </ul>
      <input
        type='text'
        placeholder='New todo'
        value={input}
        aria-label='new-todo'
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') addTodo()
        }}
      />
      <button
        onClick={addTodo}
        aria-label='add-todo'
      >
        Add Todo
      </button>
    </div>
  )
}

export default SmartTodoList
