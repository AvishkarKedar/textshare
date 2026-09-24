import { describe, it, expect } from 'vitest'
import * as Y from 'yjs'

describe('Feature: Collaborative Whiteboard Data Layer', () => {
  it('serializes and synchronizes whiteboard strokes across Yjs doc instances', () => {
    const doc1 = new Y.Doc()
    const doc2 = new Y.Doc()

    const strokes1 = doc1.getArray('whiteboard_strokes')
    const strokes2 = doc2.getArray('whiteboard_strokes')

    // Simulate stroke creation on doc1
    const testStroke = {
      id: 'stroke_1',
      tool: 'pen',
      color: '#ff5555',
      size: 4,
      points: [
        { x: 10, y: 20 },
        { x: 15, y: 25 },
        { x: 30, y: 40 },
      ],
      author: 'Test User',
      authorColor: '#50fa7b',
      timestamp: Date.now(),
    }

    strokes1.push([testStroke])

    // Sync state vector update between doc1 and doc2
    const update = Y.encodeStateAsUpdate(doc1)
    Y.applyUpdate(doc2, update)

    expect(strokes2.length).toBe(1)
    const syncedStroke = strokes2.get(0)
    expect(syncedStroke.id).toBe('stroke_1')
    expect(syncedStroke.tool).toBe('pen')
    expect(syncedStroke.color).toBe('#ff5555')
    expect(syncedStroke.points.length).toBe(3)
    expect(syncedStroke.points[2]).toEqual({ x: 30, y: 40 })

    // Clear whiteboard on doc2 and sync to doc1
    strokes2.delete(0, strokes2.length)
    const update2 = Y.encodeStateAsUpdate(doc2)
    Y.applyUpdate(doc1, update2)

    expect(strokes1.length).toBe(0)
  })

  it('supports geometric shapes (rect, circle, line) with bounding point representations', () => {
    const doc = new Y.Doc()
    const strokes = doc.getArray('whiteboard_strokes')

    const rectStroke = {
      id: 'rect_1',
      tool: 'rect',
      color: '#8be9fd',
      size: 2,
      points: [
        { x: 0, y: 0 },
        { x: 100, y: 100 },
      ],
      timestamp: Date.now(),
    }

    const circleStroke = {
      id: 'circle_1',
      tool: 'circle',
      color: '#bd93f9',
      size: 3,
      points: [
        { x: 50, y: 50 },
        { x: 75, y: 75 },
      ],
      timestamp: Date.now(),
    }

    strokes.push([rectStroke, circleStroke])
    expect(strokes.length).toBe(2)
    expect(strokes.get(0).tool).toBe('rect')
    expect(strokes.get(1).tool).toBe('circle')
  })
})
