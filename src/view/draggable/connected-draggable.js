// @flow
import memoizeOne from 'memoize-one';
import { connect } from 'react-redux';
import { createSelector } from 'reselect';
import {
  dragSelector,
  pendingDropSelector,
  phaseSelector,
} from '../../state/selectors';
import Draggable from './draggable';
import { storeKey } from '../context-keys';
import {
  lift as liftAction,
  move as moveAction,
  moveForward as moveForwardAction,
  moveBackward as moveBackwardAction,
  drop as dropAction,
  cancel as cancelAction,
  dropAnimationFinished as dropAnimationFinishedAction,
  moveByWindowScroll as moveByWindowScrollAction,
} from '../../state/action-creators';
import type {
  State,
  Position,
  DraggableId,
  DragState,
  PendingDrop,
  Phase,
  DragMovement,
  DraggableDimension,
} from '../../types';
import type {
  MapProps,
  OwnProps,
  DispatchProps,
} from './draggable-types';

const origin: Position = { x: 0, y: 0 };

const defaultMapProps: MapProps = {
  isDropAnimating: false,
  isDragging: false,
  canLift: true,
  // By default the item will not animate unless instructed to.
  // If animation is enabled then there may be some animation
  // at unexpected points: such as on a DROP_COMPLETE
  canAnimate: false,
  offset: origin,
  dimension: null,
};

export const makeSelector = () => {
  const idSelector = (state: State, ownProps: OwnProps) => ownProps.draggableId;

  const memoizedOffset = memoizeOne(
    (x: number, y: number): Position => ({
      x, y,
    }),
  );

  const getWithMovement = memoizeOne(
    (offset: Position, canLift: boolean): MapProps => ({
      isDropAnimating: false,
      isDragging: false,
      canAnimate: true,
      canLift,
      offset,
      dimension: null,
    }),
  );

  const getNotDraggingProps = memoizeOne(
    (draggableId: DraggableId,
      movement: DragMovement,
      canLift: boolean,
    ): MapProps => {
      const needsToMove = movement.draggables.indexOf(draggableId) !== -1;

      if (!needsToMove) {
        return getWithMovement(
          origin,
          canLift
        );
      }

      const amount = movement.isMovingForward ? -movement.amount : movement.amount;

      return getWithMovement(
        // currently not handling horizontal movement
        memoizedOffset(0, amount),
        canLift,
      );
    },
  );

  const draggableSelector = (state: State, ownProps: OwnProps): ?DraggableDimension => {
    if (!state.dimension) {
      return null;
    }
    const dimension: ?DraggableDimension = state.dimension.draggable[ownProps.draggableId];

    // dimension might not be published yet
    if (!dimension) {
      return null;
    }

    return dimension;
  };

  return createSelector(
    [
      idSelector,
      phaseSelector,
      dragSelector,
      pendingDropSelector,
      draggableSelector,
    ],
    (id: DraggableId,
      phase: Phase,
      drag: ?DragState,
      pending: ?PendingDrop,
      dimension: ?DraggableDimension,
    ): MapProps => {
      if (phase === 'DRAGGING') {
        if (!drag) {
          console.error('invalid dragging state');
          return defaultMapProps;
        }

        const { current, impact } = drag;

        if (current.id !== id) {
          return getNotDraggingProps(
            id,
            impact.movement,
            // disallowing lifting while dragging something else
            false,
          );
        }

        // this item is dragging
        const offset: Position = current.client.offset;
        const canAnimate: boolean = current.shouldAnimate;

        // not memoizing result as it should not move without an update
        return {
          isDragging: true,
          canLift: false,
          isDropAnimating: false,
          canAnimate,
          offset,
          dimension,
        };
      }

      if (phase === 'DROP_ANIMATING') {
        if (!pending) {
          console.error('cannot animate drop without a pending drop');
          return defaultMapProps;
        }

        if (pending.result.draggableId !== id) {
          // This flag is a matter of degree.
          // When dropping chances are Draggables have already mostly moved to where
          // they need to be. When cancelling, Draggables still have to travel
          // to their original position. If the user clicks on one while returning
          // home then the original scroll position will be off

          // We want to enable dragging as quickly as possible

          // Ideally the drag-handle would be intelligent enough to remove any
          // temporary animating offset from its initial position
          const canLift = pending.type === 'DROP';

          return getNotDraggingProps(
            id,
            pending.impact.movement,
            canLift,
          );
        }

        return {
          isDragging: false,
          isDropAnimating: true,
          canAnimate: true,
          offset: pending.newHomeOffset,
          // cannot lift something that is dropping
          canLift: false,
          // still need to provide the dimension for the placeholder
          dimension,
        };
      }

      // All unhandled phases
      return defaultMapProps;
    },
  );
};

const makeMapStateToProps = () => {
  const selector = makeSelector();
  return (state: State, props: OwnProps) => selector(state, props);
};

const mapDispatchToProps: DispatchProps = {
  lift: liftAction,
  move: moveAction,
  moveBackward: moveBackwardAction,
  moveForward: moveForwardAction,
  moveByWindowScroll: moveByWindowScrollAction,
  drop: dropAction,
  dropAnimationFinished: dropAnimationFinishedAction,
  cancel: cancelAction,
};

// Leaning heavily on the default shallow equality checking
// that `connect` provides.
// It avoids needing to do it own within `Draggable`
export default connect(
  // returning a function to ensure each
  // Draggable gets its own selector
  makeMapStateToProps,
  mapDispatchToProps,
  null,
  { storeKey },
)(Draggable);

