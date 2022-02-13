//@flow
import React, { Component } from "react";
import { StaticMap } from "react-map-gl";
import DeckGL, { FlyToInterpolator } from "deck.gl";
import { ScatterplotLayer, TextLayer } from "@deck.gl/layers";
import Supercluster from "supercluster";
import _ from "lodash";
import CONFIG from "./data.config.js";
import Downshift from "downshift";
import "./style.scss";

// Set your mapbox token here
const INITIAL_VIEW_STATE = {
  latitude: 50,
  longitude: -110,
  zoom: 9,
  minZoom: 2,
  maxZoom: 18,
  bearing: 4,
  pitch: 2
};

class ServiceMap extends Component {
  constructor(props: any, context: any) {
    super(props);
    const sortData = [...this.props.data].sort(
      (a, b) => a.sub_count - b.sub_count
    );
    this.state = {
      viewState: {
        ...INITIAL_VIEW_STATE,
        latitude: sortData[sortData.length - 1].lat,
        longitude: sortData[sortData.length - 1].lon
      },
      clusterEnable:
        CONFIG.cluster_enable !== void 0 ? CONFIG.cluster_enable : true,
      clusterTopNodes:
        CONFIG.cluster_top_n_nodes !== void 0 ? CONFIG.cluster_top_n_nodes : 3
    };
  }
  _nullToZero(data: number): number {
    return !!data ? data : 0;
  }
  _nullToEmptyStr(data: string): string {
    return data !== "null" ? data : "";
  }
  checkScoreLevel(score: number): Array<number> {
    let thresholds = CONFIG.score_thresholds;
    let colors = CONFIG.score_colors;
    let color = [255, 255, 255, 1];
    if (thresholds && colors) {
      for (let i = thresholds.length - 1; i >= 0; i--) {
        if (score >= thresholds[i]) {
          color = colors[i];
          break;
        }
      }
    }
    return color;
  }

  handleChangeViewport = ({ viewState }) => {
    console.log("viewState.zoom = ", viewState.zoom);
    this.setState({ viewState });
  };

  cubicIn = t => {
    return Math.pow(t, 3);
  };

  goToSelectedLocation = (selectedLocation, zoom = 8) => {
    this.setState({
      viewState: {
        ...this.state.viewState,
        longitude: selectedLocation[0],
        latitude: selectedLocation[1],
        zoom: zoom,
        transitionEasing: t => {
          if (t < 0.5) return this.cubicIn(t * 2.0) / 2.0;
          return 1 - this.cubicIn((1 - t) * 2) / 2;
        },
        transitionDuration: 3000,
        transitionInterpolator: new FlyToInterpolator(),
        location: []
      }
    });
  };
  _goToNYC = () => {
    this.setState({
      viewState: {
        ...this.state.viewState,
        longitude: -74.1,
        latitude: 40.7,
        zoom: 14,
        pitch: 0,
        bearing: 0,
        transitionDuration: 3000,
        transitionInterpolator: new FlyToInterpolator()
      }
    });
  };

  renderLayers = data => {
    let tempLayer = data.map(d => ({
      type: "Feature",
      geometry: {
        type: "Point",
        coordinates: [this._nullToZero(d.lon), this._nullToZero(d.lat)]
      },
      properties: {
        name: this._nullToEmptyStr(String(d.location_name)),
        color: this.checkScoreLevel(this._nullToZero(Number(d.score))),
        subscriberCount: this._nullToZero(Number(d.sub_count)),
        score: this._nullToZero(Number(d.score))
      }
    }));
    const index = new Supercluster({
      radius: 40,
      maxZoom: 16
    });
    const z = Math.floor(this.state.viewState.zoom);
    index.load(tempLayer);
    let clustersData = this.state.clusterEnable
      ? index.getClusters([-180, -90, 180, 90], z).map(item => {
          let score = _.has(item, "id")
            ? index
                .getLeaves(item.id, Infinity)
                .reduce(
                  (accumulator, item) =>
                    accumulator +
                    item.properties.score * item.properties.subscriberCount,
                  0
                ) /
              index
                .getLeaves(item.id, Infinity)
                .reduce(
                  (accumulator, item) =>
                    accumulator + item.properties.subscriberCount,
                  0
                )
            : item.properties.score;

          const cluster_top_n_nodes = this.state.clusterTopNodes;
          let name = _.has(item, "id")
            ? [...index.getLeaves(item.id, Infinity)]
                .sort((a, b) => b.properties.score - a.properties.score)
                .slice(0, cluster_top_n_nodes)
                .reduce(
                  (accumulator, item) =>
                    accumulator + item.properties.name + "<br/>",
                  ""
                )
            : item.properties.name;
          score = score.toFixed(2);
          return {
            type: "Feature",
            geometry: item.geometry,
            id: item.id,
            properties: {
              ...item.properties,
              color: this.checkScoreLevel(score),
              clustered: _.has(item, "id")
                ? index
                    .getLeaves(item.id, Infinity)
                    .map(iterable => iterable.properties.name)
                : [item.properties.name],
              subscriberCount: _.has(item, "id")
                ? index
                    .getLeaves(item.id, Infinity)
                    .reduce(
                      (accumulator, item) =>
                        accumulator + item.properties.subscriberCount,
                      0
                    )
                : item.properties.subscriberCount,
              name: name,
              score: score
            }
          };
        }, index)
      : tempLayer;

    return [
      new ScatterplotLayer({
        id: "plotter",
        data: clustersData,
        getPosition: d => d.geometry.coordinates,
        getRadius: d =>
          d.properties.point_count ? d.properties.point_count * 1000 : 10,
        radiusMinPixels: 16,
        radiusMaxPixels: 50,
        stroked: false,
        pickable: true,
        parameters: {
          depthTest: false
        },
        getFillColor: d => d.properties.color,
        updateTriggers: {
          // getPosition: this.props.updateTriggers.getPosition,
        },
        onHover: info => {
          this.setState({
            hoveredObject: info.object,
            pointerX: info.x,
            pointerY: info.y
          });
        },
        onClick: info => {
          // this._onClick(info);
          // this.goToSelectedLocation(info.object.geometry.coordinates);
          this.setState({ location: [info.object] });
          console.log(this.state.location);
        },
        transitions: {
          getPositions: d => d,
          getColors: {
            duration: 1000,
            // easing: d3.easeCubicInOut,
            enter: value => [value[0], value[1], value[2], 0] // fade in
          }
        }
      }),
      new ScatterplotLayer({
        id: "plotter_selected",
        data: this.state.location,
        getPosition: d => d.geometry.coordinates,
        getRadius: d =>
          d.properties.point_count ? d.properties.point_count * 1000 : 10,
        radiusMinPixels: 16,
        radiusMaxPixels: 50,
        stroked: true,
        pickable: true,
        getLineWidth: 10,
        lineWidthMinPixels: 3,
        getLineColor: d => [0, 0, 0, 255],
        getFillColor: d => d.color,
        onHover: info => {
          this.setState({
            hoveredObject: info.object,
            pointerX: info.x,
            pointerY: info.y
          });
        },
        onClick: info => {
          // this._onClick(info);
          // this.goToSelectedLocation(info.object.geometry.coordinates);
          this.setState({ location: info.object });
        },
        transitions: {
          getPositions: d => d,
          getColors: {
            duration: 1000,
            // easing: d3.easeCubicInOut,
            enter: value => [value[0], value[1], value[2], 0] // fade in
          }
        }
      }),
      new TextLayer({
        id: "words",
        billboard: false,
        data: clustersData,
        pickable: false,
        parameters: {
          depthTest: false
        },
        getText: d =>
          `${d.properties.point_count ? d.properties.point_count : 1}`,
        getPosition: d => d.geometry.coordinates,
        getColor: d => [255, 255, 255],
        getSize: d => 18,
        sizeScale: 32 / 30,
        fontFamily: "Helvetica, Arial"
      })
    ];
  };

  render() {
    const data = this.props.data;

    if (data) {
      const layers = this.renderLayers(data);
      return (
        <>
          <div className="service-map">
            <DeckGL
              layers={layers}
              viewState={this.state.viewState}
              controller={true}
              onViewStateChange={this.handleChangeViewport}
            >
              <StaticMap
                reuseMaps
                preventStyleDiffing={true}
                mapboxApiAccessToken={
                  "pk.eyJ1IjoibWFsemFlZW0iLCJhIjoiY2p4NmkzOXgxMDBjeDQ4bGU1amd0bmpldSJ9.GnAINcUyYPCE_M78b22USA"
                }
                mapStyle="mapbox://styles/mapbox/light-v9"
              />
            </DeckGL>
            <div
              style={{
                position: "absolute",
                top: "10px",
                left: "10px",
                zIndex: "9999"
              }}
            >
              <Downshift
                onChange={selected => alert(selected)}
                itemToString={data => (data ? data.location_name : "")}
              >
                {({
                  getInputProps,
                  getItemProps,
                  isOpen,
                  inputValue,
                  highlightedIndex,
                  selectedItem,
                  highlightedItem,
                  getLabelProps
                }) => (
                  <div>
                    <label
                      style={{ marginTop: "1rem", display: "block" }}
                      {...getLabelProps()}
                    />{" "}
                    <br />
                    <input
                      {...getInputProps({ placeholder: "Search by locations" })}
                    />
                    {isOpen ? (
                      <div className="downshift-dropdown">
                        {data
                          .filter(
                            item =>
                              !inputValue ||
                              item.location_name
                                .toLowerCase()
                                .includes(inputValue.toLowerCase())
                          )
                          .map((item, index) => (
                            <div
                              className="dropdown-item"
                              {...getItemProps({
                                key: item.location_name,
                                index,
                                item
                              })}
                              style={{
                                backgroundColor:
                                  highlightedIndex === index
                                    ? "lightgray"
                                    : "white",
                                fontWeight:
                                  selectedItem === item ? "bold" : "normal"
                              }}
                            >
                              {item.location_name}
                            </div>
                          ))}
                      </div>
                    ) : null}
                  </div>
                )}
              </Downshift>
            </div>
          </div>
        </>
      );
    } else {
      return <div className="service-map" />;
    }
  }

  // static _mapStateToProps = (state: Object) => {};
  // static _mapDispatchToProps = (dispatch: function) => {};
}

// export default connect(ServiceMap._mapStateToProps, ServiceMap._mapDispatchToProps) (ServiceMap);
export default ServiceMap;
