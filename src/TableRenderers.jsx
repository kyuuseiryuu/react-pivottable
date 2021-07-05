import React from 'react';
import PropTypes from 'prop-types';
import {PivotData, flatKey} from './Utilities';

/* eslint-disable react/prop-types */
// eslint can't see inherited propTypes!

function redColorScaleGenerator(values) {
  const min = Math.min.apply(Math, values);
  const max = Math.max.apply(Math, values);
  return (x) => {
    // eslint-disable-next-line no-magic-numbers
    const nonRed = 255 - Math.round((255 * (x - min)) / (max - min));
    return {backgroundColor: `rgb(255,${nonRed},${nonRed})`};
  };
}

const parseLabel = (value) => {
  if (typeof value === 'number' || typeof value === 'string') {
    return value;
  }
  return String(value);
};

function defaultBarchartScaleGenerator(values) {
  const min = Math.min.apply(Math, values);
  const max = Math.max.apply(Math, values);
  const range = min < 0 ? max - min : Math.max(max, 0);
  // eslint-disable-next-line no-magic-numbers
  const maxScale = 100 / 1.4;
  const scaler = (val) => Math.min(maxScale, maxScale * (val / range));

  return (val, text) => {
    let bgColor = 'gray';
    let bBase = 0;
    if (min < 0) {
      bBase = scaler(-min);
    }
    if (val < 0) {
      bBase += scaler(val);
      bgColor = 'darkred';
    }

    return (
      <div style={{position: 'relative', height: '100%'}}>
        <div
          style={{
            position: 'absolute',
            bottom: bBase + '%',
            left: 0,
            right: 0,
            height: scaler(Math.abs(val)) + '%',
            backgroundColor: bgColor,
          }}
        />
        <div style={{position: 'relative', padding: '0 5px'}}>{text}</div>
      </div>
    );
  };
}

function displayHeaderCell(
  needToggle,
  arrowIcon,
  onArrowClick,
  value,
  namesMapping
) {
  const name = namesMapping[value] || value;
  return needToggle ? (
    <span className="toggle-wrapper">
      <span className="toggle" onClick={onArrowClick}>
        {arrowIcon}
      </span>
      <span className="toggle-val">{parseLabel(name)}</span>
    </span>
  ) : (
    parseLabel(name)
  );
}

function makeRenderer(opts = {}) {
  class TableRenderer extends React.Component {
    constructor(props) {
      super(props);

      // We need state to record which entries are collapsed and which aren't.
      // This is an object with flat-keys indicating if the corresponding rows
      // should be collapsed.
      this.state = {collapsedRows: {}, collapsedCols: {}};

      this.clickHeaderHandler = this.clickHeaderHandler.bind(this);
      this.clickHandler = this.clickHandler.bind(this);
    }

    getBasePivotSettings() {
      // One-time extraction of pivot settings that we'll use throughout the render.

      const props = this.props;
      const colAttrs = props.cols;
      const rowAttrs = props.rows;

      const tableOptions = Object.assign(
        {
          rowTotals: true,
          colTotals: true,
        },
        props.tableOptions
      );
      const rowTotals = tableOptions.rowTotals || colAttrs.length === 0;
      const colTotals = tableOptions.colTotals || rowAttrs.length === 0;

      const namesMapping = props.namesMapping || {};
      const subtotalOptions = Object.assign(
        {
          arrowCollapsed: '\u25B2',
          arrowExpanded: '\u25BC',
        },
        props.subtotalOptions
      );

      const colSubtotalDisplay = Object.assign(
        {
          displayOnTop: false,
          enabled: rowTotals,
          hideOnExpand: false,
        },
        subtotalOptions.colSubtotalDisplay
      );

      const rowSubtotalDisplay = Object.assign(
        {
          displayOnTop: false,
          enabled: colTotals,
          hideOnExpand: false,
        },
        subtotalOptions.rowSubtotalDisplay
      );

      const pivotData = new PivotData(
        props,
        !opts.subtotals
          ? {}
          : {
              rowEnabled: rowSubtotalDisplay.enabled,
              colEnabled: colSubtotalDisplay.enabled,
              rowPartialOnTop: rowSubtotalDisplay.displayOnTop,
              colPartialOnTop: colSubtotalDisplay.displayOnTop,
            }
      );
      const rowKeys = pivotData.getRowKeys();
      const colKeys = pivotData.getColKeys();

      // Also pre-calculate all the callbacks for cells, etc... This is nice to have to
      // avoid re-calculations of the call-backs on cell expansions, etc...
      const cellCallbacks = {};
      const rowTotalCallbacks = {};
      const colTotalCallbacks = {};
      let grandTotalCallback = null;
      if (tableOptions.clickCallback) {
        for (const rowKey of rowKeys) {
          const flatRowKey = flatKey(rowKey);
          if (!(flatRowKey in cellCallbacks)) {
            cellCallbacks[flatRowKey] = {};
          }
          for (const colKey of colKeys) {
            cellCallbacks[flatRowKey][flatKey(colKey)] = this.clickHandler(
              pivotData,
              rowKey,
              colKey
            );
          }
        }

        // Add in totals as well.
        if (rowTotals) {
          for (const rowKey of rowKeys) {
            rowTotalCallbacks[flatKey(rowKey)] = this.clickHandler(
              pivotData,
              rowKey,
              []
            );
          }
        }
        if (colTotals) {
          for (const colKey of colKeys) {
            colTotalCallbacks[flatKey(colKey)] = this.clickHandler(
              pivotData,
              [],
              colKey
            );
          }
        }
        if (rowTotals && colTotals) {
          grandTotalCallback = this.clickHandler(pivotData, [], []);
        }
      }

      return Object.assign(
        {
          pivotData,
          colAttrs,
          rowAttrs,
          colKeys,
          rowKeys,
          rowTotals,
          colTotals,
          arrowCollapsed: subtotalOptions.arrowCollapsed,
          arrowExpanded: subtotalOptions.arrowExpanded,
          colSubtotalDisplay,
          rowSubtotalDisplay,
          cellCallbacks,
          rowTotalCallbacks,
          colTotalCallbacks,
          grandTotalCallback,
          namesMapping,
        },
        TableRenderer.heatmapMappers(
          pivotData,
          props.tableColorScaleGenerator,
          colTotals,
          rowTotals
        ),
        TableRenderer.barchartMapper(
          pivotData,
          props.barScaleGenerator,
          colTotals,
          rowTotals
        )
      );
    }

    clickHandler(pivotData, rowValues, colValues) {
      const colAttrs = this.props.cols;
      const rowAttrs = this.props.rows;
      const value = pivotData.getAggregator(rowValues, colValues).value();
      const filters = {};
      const colLimit = Math.min(colAttrs.length, colValues.length);
      for (let i = 0; i < colLimit; i++) {
        const attr = colAttrs[i];
        if (colValues[i] !== null) {
          filters[attr] = colValues[i];
        }
      }
      const rowLimit = Math.min(rowAttrs.length, rowValues.length);
      for (let i = 0; i < rowLimit; i++) {
        const attr = rowAttrs[i];
        if (rowValues[i] !== null) {
          filters[attr] = rowValues[i];
        }
      }
      return (e) =>
        this.props.tableOptions.clickCallback(e, value, filters, pivotData);
    }

    clickHeaderHandler(
      pivotData,
      values,
      attrs,
      attrIdx,
      callback,
      isSubtotal = false,
      isGrandTotal = false
    ) {
      const filters = {};
      for (let i = 0; i <= attrIdx; i++) {
        const attr = attrs[i];
        filters[attr] = values[i];
      }
      return (e) =>
        callback(
          e,
          values[attrIdx],
          filters,
          pivotData,
          isSubtotal,
          isGrandTotal
        );
    }

    collapseAttr(rowOrCol, attrIdx, allKeys) {
      return (e) => {
        // Collapse an entire attribute.
        e.stopPropagation();
        const keyLen = attrIdx + 1;
        const collapsed = allKeys
          .filter((k) => k.length === keyLen)
          .map(flatKey);

        const updates = {};
        collapsed.forEach((k) => {
          updates[k] = true;
        });

        if (rowOrCol) {
          this.setState((state) => ({
            collapsedRows: Object.assign({}, state.collapsedRows, updates),
          }));
        } else {
          this.setState((state) => ({
            collapsedCols: Object.assign({}, state.collapsedCols, updates),
          }));
        }
      };
    }

    expandAttr(rowOrCol, attrIdx, allKeys) {
      return (e) => {
        // Expand an entire attribute. This implicitly implies expanding all of the
        // parents as well. It's a bit inefficient but ah well...
        e.stopPropagation();
        const updates = {};
        allKeys.forEach((k) => {
          for (let i = 0; i <= attrIdx; i++) {
            updates[flatKey(k.slice(0, i + 1))] = false;
          }
        });

        if (rowOrCol) {
          this.setState((state) => ({
            collapsedRows: Object.assign({}, state.collapsedRows, updates),
          }));
        } else {
          this.setState((state) => ({
            collapsedCols: Object.assign({}, state.collapsedCols, updates),
          }));
        }
      };
    }

    toggleRowKey(flatRowKey) {
      return (e) => {
        e.stopPropagation();
        this.setState((state) => ({
          collapsedRows: Object.assign({}, state.collapsedRows, {
            [flatRowKey]: !state.collapsedRows[flatRowKey],
          }),
        }));
      };
    }

    toggleColKey(flatColKey) {
      return (e) => {
        e.stopPropagation();
        this.setState((state) => ({
          collapsedCols: Object.assign({}, state.collapsedCols, {
            [flatColKey]: !state.collapsedCols[flatColKey],
          }),
        }));
      };
    }

    calcAttrSpans(attrArr, numAttrs) {
      // Given an array of attribute values (i.e. each element is another array with
      // the value at every level), compute the spans for every attribute value at
      // every level. The return value is a nested array of the same shape. It has
      // -1's for repeated values and the span number otherwise.

      const spans = [];
      // Index of the last new value
      const li = Array(numAttrs).map(() => 0);
      let lv = Array(numAttrs).map(() => null);
      for (let i = 0; i < attrArr.length; i++) {
        // Keep increasing span values as long as the last keys are the same. For
        // the rest, record spans of 1. Update the indices too.
        const cv = attrArr[i];
        const ent = [];
        let depth = 0;
        const limit = Math.min(lv.length, cv.length);
        while (depth < limit && lv[depth] === cv[depth]) {
          ent.push(-1);
          spans[li[depth]][depth]++;
          depth++;
        }
        while (depth < cv.length) {
          li[depth] = i;
          ent.push(1);
          depth++;
        }
        spans.push(ent);
        lv = cv;
      }
      return spans;
    }

    static heatmapMappers(
      pivotData,
      colorScaleGenerator,
      colTotals,
      rowTotals
    ) {
      let valueCellColors = () => ({});
      let rowTotalColors = () => ({});
      let colTotalColors = () => ({});
      if (opts.heatmapMode) {
        if (colTotals) {
          const colTotalValues = Object.values(pivotData.colTotals).map((a) =>
            a.value()
          );
          colTotalColors = colorScaleGenerator(colTotalValues);
        }
        if (rowTotals) {
          const rowTotalValues = Object.values(pivotData.rowTotals).map((a) =>
            a.value()
          );
          rowTotalColors = colorScaleGenerator(rowTotalValues);
        }
        if (opts.heatmapMode === 'full') {
          const allValues = [];
          Object.values(pivotData.tree).map((cd) =>
            Object.values(cd).map(
              (a) => !a.isSubtotal && allValues.push(a.value())
            )
          );
          const colorScale = colorScaleGenerator(allValues);
          valueCellColors = (r, c, v) => colorScale(v);
        } else if (opts.heatmapMode === 'row') {
          const rowColorScales = {};
          Object.entries(pivotData.tree).map(([rk, cd]) => {
            const rowValues = Object.values(cd).map(
              (a) => !a.isSubtotal && a.value()
            );
            rowColorScales[rk] = colorScaleGenerator(rowValues);
          });
          valueCellColors = (r, c, v) => rowColorScales[flatKey(r)](v);
        } else if (opts.heatmapMode === 'col') {
          const colColorScales = {};
          const colValues = {};
          Object.values(pivotData.tree).map((cd) =>
            Object.entries(cd).map(([ck, a]) => {
              if (!(ck in colValues)) {
                colValues[ck] = [];
              }
              if (!a.isSubtotal) {
                colValues[ck].push(a.value());
              }
            })
          );
          for (const k in colValues) {
            colColorScales[k] = colorScaleGenerator(colValues[k]);
          }
          valueCellColors = (r, c, v) => colColorScales[flatKey(c)](v);
        }
      }
      return {valueCellColors, rowTotalColors, colTotalColors};
    }

    static barchartMapper(pivotData, barScaleGenerator, colTotals, rowTotals) {
      let cellStyle = {};
      let valueCellBar = (r, c, v, t) => t;
      let rowTotalBar = (v, t) => t;
      let colTotalBar = (v, t) => t;

      if (opts.barchartMode) {
        cellStyle = {
          textAlign: 'center',
          padding: 0,
          paddingTop: '5px',
          height: '60px',
        };
        if (colTotals) {
          const colTotalValues = Object.values(pivotData.colTotals)
            .filter((a) => !a.isSubtotal)
            .map((a) => a.value());
          colTotalBar = barScaleGenerator(colTotalValues);
        }
        if (rowTotals) {
          const rowTotalValues = Object.values(pivotData.rowTotals)
            .filter((a) => !a.isSubtotal)
            .map((a) => a.value());
          rowTotalBar = barScaleGenerator(rowTotalValues);
        }
        if (opts.barchartMode === 'full') {
          const allValues = [];
          Object.values(pivotData.tree).map((cd) =>
            Object.values(cd).map(
              (a) => !a.isSubtotal && allValues.push(a.value())
            )
          );
          const barScales = barScaleGenerator(allValues);
          valueCellBar = (r, c, v, t) => barScales(v, t);
        } else if (opts.barchartMode === 'row') {
          const rowBarScales = {};
          Object.entries(pivotData.tree).map(([rk, cd]) => {
            const rowValues = Object.values(cd).map(
              (a) => !a.isSubtotal && a.value()
            );
            rowBarScales[rk] = barScaleGenerator(rowValues);
          });
          valueCellBar = (r, c, v, t) => rowBarScales[flatKey(r)](v, t);
        } else if (opts.barchartMode === 'col') {
          const colBarScales = {};
          const colValues = {};
          Object.values(pivotData.tree).map((cd) =>
            Object.entries(cd).map(([ck, a]) => {
              if (!(ck in colValues)) {
                colValues[ck] = [];
              }
              if (!a.isSubtotal) {
                colValues[ck].push(a.value());
              }
            })
          );
          for (const k in colValues) {
            colBarScales[k] = barScaleGenerator(colValues[k]);
          }
          valueCellBar = (r, c, v, t) => colBarScales[flatKey(c)](v, t);
        }
      }
      return {cellStyle, valueCellBar, rowTotalBar, colTotalBar};
    }

    renderColHeaderRow(attrName, attrIdx, pivotSettings) {
      // Render a single row in the column header at the top of the pivot table.

      const {
        rowAttrs,
        colAttrs,
        colKeys,
        visibleColKeys,
        colAttrSpans,
        rowTotals,
        arrowExpanded,
        arrowCollapsed,
        colSubtotalDisplay,
        maxColVisible,
        pivotData,
        namesMapping,
      } = pivotSettings;
      const {
        highlightHeaderCellsOnHover,
        omittedHighlightHeaderGroups = [],
        highlightedHeaderCells,
      } = this.props.tableOptions;

      const spaceCell =
        attrIdx === 0 && rowAttrs.length !== 0 ? (
          <th
            key="padding"
            colSpan={rowAttrs.length}
            rowSpan={colAttrs.length}
          />
        ) : null;

      const needToggle =
        opts.subtotals &&
        colSubtotalDisplay.enabled &&
        attrIdx !== colAttrs.length - 1;
      let arrowClickHandle = null;
      let subArrow = null;
      if (needToggle) {
        arrowClickHandle =
          attrIdx + 1 < maxColVisible
            ? this.collapseAttr(false, attrIdx, colKeys)
            : this.expandAttr(false, attrIdx, colKeys);
        subArrow =
          (attrIdx + 1 < maxColVisible ? arrowExpanded : arrowCollapsed) + ' ';
      }
      const attrNameCell = (
        <th key="label" className="pvtAxisLabel">
          {displayHeaderCell(
            needToggle,
            subArrow,
            arrowClickHandle,
            attrName,
            namesMapping
          )}
        </th>
      );

      const attrValueCells = [];
      const rowIncrSpan = rowAttrs.length !== 0 ? 1 : 0;
      // Iterate through columns. Jump over duplicate values.
      let i = 0;
      while (i < visibleColKeys.length) {
        const colKey = visibleColKeys[i];
        const colSpan = attrIdx < colKey.length ? colAttrSpans[i][attrIdx] : 1;
        let colLabelClass = 'pvtColLabel';
        if (attrIdx < colKey.length) {
          if (
            highlightHeaderCellsOnHover &&
            !omittedHighlightHeaderGroups.includes(colAttrs[attrIdx])
          ) {
            colLabelClass += ' hoverable';
          }
          if (
            highlightedHeaderCells &&
            Array.isArray(highlightedHeaderCells[colAttrs[attrIdx]]) &&
            highlightedHeaderCells[colAttrs[attrIdx]].includes(colKey[attrIdx])
          ) {
            colLabelClass += ' active';
          }

          const rowSpan =
            1 + (attrIdx === colAttrs.length - 1 ? rowIncrSpan : 0);
          const flatColKey = flatKey(colKey.slice(0, attrIdx + 1));
          const onArrowClick = needToggle
            ? this.toggleColKey(flatColKey)
            : null;
          attrValueCells.push(
            <th
              className={colLabelClass}
              key={'colKey-' + flatColKey}
              colSpan={colSpan}
              rowSpan={rowSpan}
              onClick={this.clickHeaderHandler(
                pivotData,
                colKey,
                this.props.cols,
                attrIdx,
                this.props.tableOptions.clickColumnHeaderCallback
              )}
            >
              {displayHeaderCell(
                needToggle,
                (this.state.collapsedCols[flatColKey]
                  ? arrowCollapsed
                  : arrowExpanded) + ' ',
                onArrowClick,
                colKey[attrIdx],
                namesMapping
              )}
            </th>
          );
        } else if (attrIdx === colKey.length) {
          const rowSpan = colAttrs.length - colKey.length + rowIncrSpan;
          attrValueCells.push(
            <th
              className={`${colLabelClass} pvtSubtotalLabel`}
              key={'colKeyBuffer-' + flatKey(colKey)}
              colSpan={colSpan}
              rowSpan={rowSpan}
              onClick={this.clickHeaderHandler(
                pivotData,
                colKey,
                this.props.cols,
                attrIdx,
                this.props.tableOptions.clickColumnHeaderCallback,
                true
              )}
            >
              Subtotal
            </th>
          );
        }
        // The next colSpan columns will have the same value anyway...
        i = i + colSpan;
      }

      const totalCell =
        attrIdx === 0 && rowTotals ? (
          <th
            key="total"
            className="pvtTotalLabel"
            rowSpan={colAttrs.length + Math.min(rowAttrs.length, 1)}
            onClick={this.clickHeaderHandler(
              pivotData,
              [],
              this.props.cols,
              attrIdx,
              this.props.tableOptions.clickColumnHeaderCallback,
              false,
              true
            )}
          >
            Totals
          </th>
        ) : null;

      const cells = [spaceCell, attrNameCell, ...attrValueCells, totalCell];
      return <tr key={`colAttr-${attrIdx}`}>{cells}</tr>;
    }

    renderRowHeaderRow(pivotSettings) {
      // Render just the attribute names of the rows (the actual attribute values
      // will show up in the individual rows).

      const {
        rowAttrs,
        colAttrs,
        rowKeys,
        arrowCollapsed,
        arrowExpanded,
        rowSubtotalDisplay,
        maxRowVisible,
        pivotData,
        namesMapping,
      } = pivotSettings;
      return (
        <tr key="rowHdr">
          {rowAttrs.map((r, i) => {
            const needLabelToggle =
              opts.subtotals &&
              rowSubtotalDisplay.enabled &&
              i !== rowAttrs.length - 1;
            let arrowClickHandle = null;
            let subArrow = null;
            if (needLabelToggle) {
              arrowClickHandle =
                i + 1 < maxRowVisible
                  ? this.collapseAttr(true, i, rowKeys)
                  : this.expandAttr(true, i, rowKeys);
              subArrow =
                (i + 1 < maxRowVisible ? arrowExpanded : arrowCollapsed) + ' ';
            }
            return (
              <th className="pvtAxisLabel" key={`rowAttr-${i}`}>
                {displayHeaderCell(
                  needLabelToggle,
                  subArrow,
                  arrowClickHandle,
                  r,
                  namesMapping
                )}
              </th>
            );
          })}
          <th
            className="pvtTotalLabel"
            key="padding"
            onClick={this.clickHeaderHandler(
              pivotData,
              [],
              this.props.rows,
              0,
              this.props.tableOptions.clickRowHeaderCallback,
              false,
              true
            )}
          >
            {colAttrs.length === 0 ? 'Totals' : null}
          </th>
        </tr>
      );
    }

    renderTableRow(rowKey, rowIdx, pivotSettings) {
      // Render a single row in the pivot table.

      const {
        rowAttrs,
        colAttrs,
        rowAttrSpans,
        visibleColKeys,
        pivotData,
        rowTotals,
        rowSubtotalDisplay,
        valueCellColors,
        cellStyle,
        valueCellBar,
        arrowExpanded,
        arrowCollapsed,
        cellCallbacks,
        rowTotalCallbacks,
        namesMapping,
      } = pivotSettings;

      const {
        highlightHeaderCellsOnHover,
        omittedHighlightHeaderGroups = [],
        highlightedHeaderCells,
      } = this.props.tableOptions;
      const flatRowKey = flatKey(rowKey);

      const colIncrSpan = colAttrs.length !== 0 ? 1 : 0;
      const attrValueCells = rowKey.map((r, i) => {
        let valueCellClassName = 'pvtRowLabel';
        if (
          highlightHeaderCellsOnHover &&
          !omittedHighlightHeaderGroups.includes(rowAttrs[i])
        ) {
          valueCellClassName += ' hoverable';
        }
        if (
          highlightedHeaderCells &&
          Array.isArray(highlightedHeaderCells[rowAttrs[i]]) &&
          highlightedHeaderCells[rowAttrs[i]].includes(r)
        ) {
          valueCellClassName += ' active';
        }
        const rowSpan = rowAttrSpans[rowIdx][i];
        if (rowSpan > 0) {
          const flatRowKey = flatKey(rowKey.slice(0, i + 1));
          const colSpan = 1 + (i === rowAttrs.length - 1 ? colIncrSpan : 0);
          const needRowToggle =
            opts.subtotals &&
            rowSubtotalDisplay.enabled &&
            i !== rowAttrs.length - 1;
          const onArrowClick = needRowToggle
            ? this.toggleRowKey(flatRowKey)
            : null;
          return (
            <th
              key={`rowKeyLabel-${i}`}
              className={valueCellClassName}
              rowSpan={rowSpan}
              colSpan={colSpan}
              onClick={this.clickHeaderHandler(
                pivotData,
                rowKey,
                this.props.rows,
                i,
                this.props.tableOptions.clickRowHeaderCallback
              )}
            >
              {displayHeaderCell(
                needRowToggle,
                (this.state.collapsedRows[flatRowKey]
                  ? arrowCollapsed
                  : arrowExpanded) + ' ',
                onArrowClick,
                r,
                namesMapping
              )}
            </th>
          );
        }
        return null;
      });

      const attrValuePaddingCell =
        rowKey.length < rowAttrs.length ? (
          <th
            className="pvtRowLabel pvtSubtotalLabel"
            key="rowKeyBuffer"
            colSpan={rowAttrs.length - rowKey.length + colIncrSpan}
            rowSpan={1}
            onClick={this.clickHeaderHandler(
              pivotData,
              rowKey,
              this.props.rows,
              rowKey.length,
              this.props.tableOptions.clickRowHeaderCallback,
              true
            )}
          >
            Subtotal
          </th>
        ) : null;

      const rowClickHandlers = cellCallbacks[flatRowKey] || {};
      const valueCells = visibleColKeys.map((colKey) => {
        const flatColKey = flatKey(colKey);
        const agg = pivotData.getAggregator(rowKey, colKey);
        const aggValue = agg.value();
        const style = Object.assign(
          {},
          agg.isSubtotal
            ? {fontWeight: 'bold'}
            : valueCellColors(rowKey, colKey, aggValue),
          cellStyle
        );
        return (
          <td
            className="pvtVal"
            key={'pvtVal-' + flatColKey}
            onClick={rowClickHandlers[flatColKey]}
            style={style}
          >
            {agg.isSubtotal
              ? agg.format(aggValue)
              : valueCellBar(rowKey, colKey, aggValue, agg.format(aggValue))}
          </td>
        );
      });

      let totalCell = null;
      if (rowTotals) {
        const agg = pivotData.getAggregator(rowKey, []);
        const aggValue = agg.value();
        totalCell = (
          <td
            key="total"
            className="pvtTotal"
            onClick={rowTotalCallbacks[flatRowKey]}
            style={cellStyle}
          >
            {agg.format(aggValue)}
          </td>
        );
      }

      const rowCells = [
        ...attrValueCells,
        attrValuePaddingCell,
        ...valueCells,
        totalCell,
      ];

      return <tr key={'keyRow-' + flatRowKey}>{rowCells}</tr>;
    }

    renderTotalsRow(pivotSettings) {
      // Render the final totals rows that has the totals for all the columns.

      const {
        rowAttrs,
        colAttrs,
        visibleColKeys,
        rowTotals,
        pivotData,
        cellStyle,
        colTotalCallbacks,
        grandTotalCallback,
      } = pivotSettings;

      const totalLabelCell = (
        <th
          key="label"
          className="pvtTotalLabel pvtRowTotalLabel"
          colSpan={rowAttrs.length + Math.min(colAttrs.length, 1)}
          onClick={this.clickHeaderHandler(
            pivotData,
            [],
            this.props.rows,
            0,
            this.props.tableOptions.clickRowHeaderCallback,
            false,
            true
          )}
        >
          Totals
        </th>
      );

      const totalValueStyle = Object.assign({}, cellStyle, {
        padding: '5px',
      });
      const totalValueCells = visibleColKeys.map((colKey) => {
        const flatColKey = flatKey(colKey);
        const agg = pivotData.getAggregator([], colKey);
        const aggValue = agg.value();

        return (
          <td
            className="pvtTotal pvtRowTotal"
            key={'total-' + flatColKey}
            onClick={colTotalCallbacks[flatColKey]}
            style={totalValueStyle}
          >
            {agg.format(aggValue)}
          </td>
        );
      });

      let grandTotalCell = null;
      if (rowTotals) {
        const agg = pivotData.getAggregator([], []);
        const aggValue = agg.value();
        grandTotalCell = (
          <td
            key="total"
            className="pvtGrandTotal pvtRowTotal"
            onClick={grandTotalCallback}
          >
            {agg.format(aggValue)}
          </td>
        );
      }

      const totalCells = [totalLabelCell, ...totalValueCells, grandTotalCell];

      return <tr key="total">{totalCells}</tr>;
    }

    visibleKeys(keys, collapsed, numAttrs, subtotalDisplay) {
      return keys.filter(
        (key) =>
          // Is the key hidden by one of its parents?
          !key.some((k, j) => collapsed[flatKey(key.slice(0, j))]) &&
          // Leaf key.
          (key.length === numAttrs ||
            // Children hidden. Must show total.
            flatKey(key) in collapsed ||
            // Don't hide totals.
            !subtotalDisplay.hideOnExpand)
      );
    }

    render() {
      if (this.cachedProps !== this.props) {
        this.cachedProps = this.props;
        this.cachedBasePivotSettings = this.getBasePivotSettings();
      }
      const {
        colAttrs,
        rowAttrs,
        rowKeys,
        colKeys,
        colTotals,
        rowSubtotalDisplay,
        colSubtotalDisplay,
      } = this.cachedBasePivotSettings;

      // Need to account for exclusions to compute the effective row
      // and column keys.
      const visibleRowKeys = opts.subtotals
        ? this.visibleKeys(
            rowKeys,
            this.state.collapsedRows,
            rowAttrs.length,
            rowSubtotalDisplay
          )
        : rowKeys;
      const visibleColKeys = opts.subtotals
        ? this.visibleKeys(
            colKeys,
            this.state.collapsedCols,
            colAttrs.length,
            colSubtotalDisplay
          )
        : colKeys;

      const pivotSettings = Object.assign(
        {
          visibleRowKeys,
          maxRowVisible: Math.max(...visibleRowKeys.map((k) => k.length)),
          visibleColKeys,
          maxColVisible: Math.max(...visibleColKeys.map((k) => k.length)),
          rowAttrSpans: this.calcAttrSpans(visibleRowKeys, rowAttrs.length),
          colAttrSpans: this.calcAttrSpans(visibleColKeys, colAttrs.length),
        },
        this.cachedBasePivotSettings
      );

      return (
        <table className="pvtTable">
          <thead>
            {colAttrs.map((c, j) =>
              this.renderColHeaderRow(c, j, pivotSettings)
            )}
            {rowAttrs.length !== 0 && this.renderRowHeaderRow(pivotSettings)}
          </thead>
          <tbody>
            {visibleRowKeys.map((r, i) =>
              this.renderTableRow(r, i, pivotSettings)
            )}
            {colTotals && this.renderTotalsRow(pivotSettings)}
          </tbody>
        </table>
      );
    }
  }

  TableRenderer.defaultProps = PivotData.defaultProps;
  TableRenderer.propTypes = PivotData.propTypes;
  TableRenderer.defaultProps.tableColorScaleGenerator = redColorScaleGenerator;
  TableRenderer.defaultProps.barScaleGenerator = defaultBarchartScaleGenerator;
  TableRenderer.defaultProps.tableOptions = {};
  TableRenderer.propTypes.tableColorScaleGenerator = PropTypes.func;
  TableRenderer.propTypes.tableOptions = PropTypes.object;
  return TableRenderer;
}

class TSVExportRenderer extends React.PureComponent {
  render() {
    const pivotData = new PivotData(this.props);
    const rowKeys = pivotData.getRowKeys();
    const colKeys = pivotData.getColKeys();
    if (rowKeys.length === 0) {
      rowKeys.push([]);
    }
    if (colKeys.length === 0) {
      colKeys.push([]);
    }

    const headerRow = pivotData.props.rows.map((r) => r);
    if (colKeys.length === 1 && colKeys[0].length === 0) {
      headerRow.push(this.props.aggregatorName);
    } else {
      colKeys.map((c) => headerRow.push(c.join('-')));
    }

    const result = rowKeys.map((r) => {
      const row = r.map((x) => x);
      colKeys.map((c) => {
        const v = pivotData.getAggregator(r, c).value();
        row.push(v ? v : '');
      });
      return row;
    });

    result.unshift(headerRow);

    return (
      <textarea
        value={result.map((r) => r.join('\t')).join('\n')}
        style={{width: window.innerWidth / 2, height: window.innerHeight / 2}}
        readOnly={true}
      />
    );
  }
}

TSVExportRenderer.defaultProps = PivotData.defaultProps;
TSVExportRenderer.propTypes = PivotData.propTypes;

export default {
  Table: makeRenderer(),
  'Table Heatmap': makeRenderer({heatmapMode: 'full'}),
  'Table Col Heatmap': makeRenderer({heatmapMode: 'col'}),
  'Table Row Heatmap': makeRenderer({heatmapMode: 'row'}),
  'Table Barchart': makeRenderer({barchartMode: 'full'}),
  'Table Col Barchart': makeRenderer({barchartMode: 'col'}),
  'Table Row Barchart': makeRenderer({barchartMode: 'row'}),
  'Table With Subtotal': makeRenderer({subtotals: true}),
  'Table With Subtotal Heatmap': makeRenderer({
    heatmapMode: 'full',
    subtotals: true,
  }),
  'Table With Subtotal Col Heatmap': makeRenderer({
    heatmapMode: 'col',
    subtotals: true,
  }),
  'Table With Subtotal Row Heatmap': makeRenderer({
    heatmapMode: 'row',
    subtotals: true,
  }),
  'Table With Subtotal Barchart': makeRenderer({
    barchartMode: 'full',
    subtotals: true,
  }),
  'Table With Subtotal Col Barchart': makeRenderer({
    barchartMode: 'col',
    subtotals: true,
  }),
  'Table With Subtotal Row Barchart': makeRenderer({
    barchartMode: 'row',
    subtotals: true,
  }),
  'Exportable TSV': TSVExportRenderer,
};
